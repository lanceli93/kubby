# Blur Placeholder 在 Windows 上不生效 — 分析报告

## 现象

- Mac 上卡片加载时有 blur 占位效果（模糊缩略图 → 清晰图片的过渡）
- Windows 安装版（`C:\Program Files\Kubby\`）上完全没有 blur 效果
- 同时，Windows 上图片也没有被 resize/转 WebP（返回原始 JPEG），说明 sharp 完全不可用

## 根因

### 直接原因：`@img/sharp-libvips-win32-x64` 包缺失

Windows 安装目录中 sharp 相关文件：

```
C:\Program Files\Kubby\server\node_modules\
├── sharp/                          ✅ 存在
├── @img/sharp-win32-x64/           ✅ 存在（含 sharp-win32-x64.node, 433KB）
└── @img/sharp-libvips-win32-x64/   ❌ 缺失！
```

`sharp-win32-x64.node` 是 Node.js native addon，它在运行时需要动态链接 libvips 的 DLL。没有 `@img/sharp-libvips-win32-x64` 包（包含 `libvips-cpp.dll` 等），加载时报错：

```
ERR_DLOPEN_FAILED: The specified module could not be found.
\\?\C:\Program Files\Kubby\server\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node
```

### 根本原因：打包脚本的 native module 处理逻辑有盲区

`scripts/package.ts` 中 `swapNativeModules()` 函数：

```typescript
if (native.npm === hostNative.npm) {
  console.log("  Native modules match host platform, no swap needed");
  return;  // ← 当 CI 在 Windows 上构建 Windows 包时，直接跳过
}
```

CI workflow（`.github/workflows/release.yml`）中 Windows 构建运行在 `windows-latest`，目标也是 `win-x64`，所以 `swapNativeModules` 认为"平台一致，不需要替换"直接返回。

此时完全依赖 Next.js standalone 输出中的 `node_modules`。但 **Next.js standalone 的文件追踪（`@vercel/nft`）没有包含 `@img/sharp-libvips-win32-x64`**。

原因是：
1. sharp 在 `next.config.ts` 中被列为 `serverExternalPackages`
2. 代码中使用 `dynamic import`（`await import("sharp")`），不是静态 import
3. `@vercel/nft` 追踪到了 `sharp` 主包和 `@img/sharp-win32-x64`（.node 文件），但 **没有追踪到 libvips 的 DLL 包**，因为 DLL 依赖是通过操作系统的动态链接器在运行时解析的，不在 Node.js 的 require graph 中

### 为什么 Mac 上没问题？

Mac 上 sharp 的 native addon（`sharp-darwin-arm64.node`）是**静态链接** libvips 的，不需要额外的 `.dylib` 文件。而 Windows 上是**动态链接**的，需要 `@img/sharp-libvips-win32-x64` 包中的 DLL 文件。

## 影响范围

sharp 不可用导致两个功能降级：

| 功能 | 预期行为 | Windows 实际行为 |
|------|---------|-----------------|
| Blur placeholder | 扫描时生成 10x15 JPEG base64，卡片加载时显示模糊占位图 | `generateBlurDataURL()` 静默返回 null，DB 中 `posterBlur` 全为 null |
| 图片 resize/WebP | `/api/images/?w=360` 返回 resize 后的 WebP（~30-50KB） | Fallback 返回原始 JPEG（~160KB），带宽浪费 3-5x |

## 修复方案

### 方案：在 `swapNativeModules` 中增加 libvips 完整性检查

即使 host 和 target 平台一致，也需要检查 libvips 包是否存在。如果缺失，从 npm registry 下载补全。

修改 `scripts/package.ts` 中的 `swapNativeModules` 函数：

```typescript
async function swapNativeModules(platform: Platform, outputDir: string, skipDownload: boolean) {
  const hostPlatform = detectPlatform();
  const native = NATIVE_PLATFORM_MAP[platform];
  const hostNative = NATIVE_PLATFORM_MAP[hostPlatform];
  const serverNodeModules = path.join(outputDir, "server", "node_modules");

  const isSamePlatform = native.npm === hostNative.npm;

  if (isSamePlatform) {
    console.log("  Native modules match host platform, checking completeness...");
  } else {
    console.log(`  Swapping native modules: ${hostNative.npm} → ${native.npm}`);

    // Remove host platform sharp packages
    const hostSharpDir = path.join(serverNodeModules, `@img/sharp-${hostNative.npm}`);
    const hostSharpLibvipsDir = path.join(serverNodeModules, `@img/sharp-libvips-${hostNative.npm}`);
    if (fs.existsSync(hostSharpDir)) {
      fs.rmSync(hostSharpDir, { recursive: true });
      console.log(`  Removed @img/sharp-${hostNative.npm}`);
    }
    if (fs.existsSync(hostSharpLibvipsDir)) {
      fs.rmSync(hostSharpLibvipsDir, { recursive: true });
      console.log(`  Removed @img/sharp-libvips-${hostNative.npm}`);
    }
  }

  // Ensure target sharp + libvips packages exist (handles both cross-platform and same-platform)
  const targetSharpPkg = `@img/sharp-${native.npm}`;
  const targetLibvipsPkg = `@img/sharp-libvips-${native.npm}`;

  for (const pkg of [targetSharpPkg, targetLibvipsPkg]) {
    const pkgDir = path.join(serverNodeModules, pkg);
    if (fs.existsSync(pkgDir)) {
      console.log(`  ${pkg} already present, skipping`);
      continue;
    }

    // Download from npm registry
    const tarballUrl = await getNpmTarballUrl(pkg);
    if (!tarballUrl) {
      console.warn(`  WARNING: Could not find ${pkg} on npm`);
      continue;
    }
    const cachePath = path.join(DOWNLOAD_CACHE, `${pkg.replace("/", "-")}.tgz`);
    if (!skipDownload) {
      await downloadFile(tarballUrl, cachePath);
    }
    if (fs.existsSync(cachePath)) {
      const extractDir = path.join(DOWNLOAD_CACHE, "npm-extract");
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
      ensureDir(extractDir);
      execSync(`tar xzf "${cachePath}" -C "${extractDir}"`, { stdio: "ignore" });
      const pkgExtracted = path.join(extractDir, "package");
      ensureDir(path.dirname(pkgDir));
      if (fs.existsSync(pkgExtracted)) {
        copyDirRecursive(pkgExtracted, pkgDir);
        console.log(`  Installed ${pkg}`);
      }
      fs.rmSync(extractDir, { recursive: true });
    }
  }

  // --- better-sqlite3 --- (only for cross-platform)
  if (!isSamePlatform) {
    // ... existing better-sqlite3 swap logic unchanged ...
  }
}
```

核心改动：
1. 去掉 same-platform 时的 `return`
2. 对 sharp + libvips 两个包都做存在性检查
3. 缺失时从 npm registry 下载补全
4. better-sqlite3 的 swap 逻辑仍然只在跨平台时执行（same-platform 时 standalone 自带的是正确的）

### 修复后的验证

修复打包脚本后，需要：

1. 重新打包 Windows 版本
2. 检查安装目录中 `@img/sharp-libvips-win32-x64` 是否存在
3. 重新扫描媒体库（或写 backfill 脚本）以生成 `posterBlur` 数据
4. 验证 `/api/images/?w=360` 返回 `image/webp`

### 已有数据的 Backfill

现有 Windows 用户升级后，DB 中的 `posterBlur` 仍为 null。需要在扫描逻辑中增加 backfill：当发现 `posterPath` 存在但 `posterBlur` 为 null 时，重新生成 blur data。或者提供一个"重新扫描"按钮触发全量更新。

## 诊断过程

1. Chrome DevTools 检查页面上的 `<img>` 元素 → 没有 `background-image`（blur placeholder）和 `filter: blur()` 样式
2. 调用 `/api/movies` API → 所有 movie 的 `posterBlur` 字段为 `null`
3. 检查图片响应 → `Content-Type: image/jpeg`（应为 `image/webp`），确认 sharp 不可用
4. 检查安装目录 → `@img/sharp-win32-x64` 存在但 `@img/sharp-libvips-win32-x64` 缺失
5. 直接用打包的 Node.js 加载 sharp → `ERR_DLOPEN_FAILED`
6. 分析打包脚本 → `swapNativeModules` 在 same-platform 时跳过，Next.js standalone 未追踪到 libvips 包
