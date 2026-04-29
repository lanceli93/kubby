# Blur Placeholder 在 Windows 上不生效 — 分析报告

## 现象

- Mac 上卡片加载时有 blur 占位效果（模糊缩略图 → 清晰图片的过渡）
- Windows 安装版（`C:\Program Files\Kubby\`）上完全没有 blur 效果
- 同时，Windows 上图片也没有被 resize/转 WebP（返回原始 JPEG），说明 sharp 完全不可用

## 根因

### 直接原因：`@img/sharp-win32-x64/lib/` 中缺少 DLL 文件

`npm install` 后，`@img/sharp-win32-x64/lib/` 目录包含 3 个文件：

```
node_modules/@img/sharp-win32-x64/lib/
├── sharp-win32-x64.node    (433 KB)  ← Node.js native addon
├── libvips-42.dll           (19 MB)   ← libvips 核心库
└── libvips-cpp-8.17.3.dll   (327 KB)  ← libvips C++ 绑定
```

但 Next.js standalone 输出（`@vercel/nft` 文件追踪）只复制了 `.node` 文件：

```
打包后 @img/sharp-win32-x64/lib/
├── sharp-win32-x64.node    (433 KB)  ✅
├── libvips-42.dll                     ❌ 缺失！
└── libvips-cpp-8.17.3.dll             ❌ 缺失！
```

`sharp-win32-x64.node` 在运行时通过 Windows `LoadLibrary` 加载同目录下的 `libvips-42.dll`。DLL 缺失导致：

```
ERR_DLOPEN_FAILED: The specified module could not be found.
\\?\C:\Program Files\Kubby\server\node_modules\@img\sharp-win32-x64\lib\sharp-win32-x64.node
```

> **注意**：`@img/sharp-libvips-win32-x64` 是一个独立的 npm 包，也包含 `libvips-42.dll`，但 sharp 实际上是从 `@img/sharp-win32-x64/lib/` 同目录加载 DLL 的。仅安装 `@img/sharp-libvips-win32-x64` 到 `node_modules/@img/` 下**不能**解决问题 — DLL 必须在 `.node` 文件的同目录。

### 根本原因：Next.js standalone + 打包脚本的双重盲区

**盲区 1：`@vercel/nft` 不追踪 `.dll` 文件**

Next.js standalone 模式使用 `@vercel/nft` 做文件追踪，它只追踪 Node.js 的 `require()` / `import()` 依赖图。`.dll` 文件是操作系统级的动态链接依赖，不在 Node.js 模块图中，所以被遗漏。

**盲区 2：`swapNativeModules` 在 same-platform 时跳过**

`scripts/package.ts` 中：

```typescript
if (native.npm === hostNative.npm) {
  console.log("  Native modules match host platform, no swap needed");
  return;  // ← CI 在 Windows 上构建 Windows 包时，直接跳过
}
```

CI workflow 中 Windows 构建运行在 `windows-latest`，目标也是 `win-x64`，所以 `swapNativeModules` 认为"平台一致，不需要替换"直接返回。没有机会补全缺失的 DLL。

### 为什么 Mac 上没问题？

Mac 上 `@img/sharp-darwin-arm64/lib/` 只有一个文件 `sharp-darwin-arm64.node`，libvips 是**静态链接**进去的。不需要额外的 `.dylib` 文件，所以 `@vercel/nft` 只追踪 `.node` 文件就够了。

Windows 上 sharp 使用**动态链接**，`.node` 文件 + `.dll` 文件必须共存于同一目录。

## 影响范围

sharp 不可用导致两个功能降级：

| 功能 | 预期行为 | Windows 实际行为 |
|------|---------|-----------------|
| Blur placeholder | 扫描时生成 10x15 JPEG base64，卡片加载时显示模糊占位图 | `generateBlurDataURL()` 静默返回 null，DB 中 `posterBlur` 全为 null |
| 图片 resize/WebP | `/api/images/?w=360` 返回 resize 后的 WebP（~30-50KB） | Fallback 返回原始 JPEG（~160KB），带宽浪费 3-5x |

## 修复方案

修改 `scripts/package.ts` 中的 `swapNativeModules` 函数，在 same-platform 场景下也检查并补全 DLL 文件。

核心逻辑：检查 `@img/sharp-{platform}/lib/` 目录下是否有 `.dll` 文件（Windows）。如果缺失，从 `@img/sharp-libvips-{platform}/lib/` 复制过来，或从 npm registry 下载 `@img/sharp-{platform}` 完整包覆盖。

```typescript
async function swapNativeModules(platform: Platform, outputDir: string, skipDownload: boolean) {
  const hostPlatform = detectPlatform();
  const native = NATIVE_PLATFORM_MAP[platform];
  const hostNative = NATIVE_PLATFORM_MAP[hostPlatform];
  const serverNodeModules = path.join(outputDir, "server", "node_modules");
  const isSamePlatform = native.npm === hostNative.npm;

  if (!isSamePlatform) {
    // ... existing cross-platform swap logic (remove host, download target) ...
  }

  // ── Ensure sharp native package is COMPLETE (DLLs included) ──
  // Next.js standalone (@vercel/nft) only traces .node files, missing .dll on Windows.
  // Fix: re-download the full @img/sharp-{platform} package from npm to get all files.
  const sharpNativePkg = `@img/sharp-${native.npm}`;
  const sharpNativeDir = path.join(serverNodeModules, sharpNativePkg);
  const sharpLibDir = path.join(sharpNativeDir, "lib");

  if (fs.existsSync(sharpLibDir)) {
    const dllFiles = fs.readdirSync(sharpLibDir).filter(f => f.endsWith(".dll"));
    const nodeFiles = fs.readdirSync(sharpLibDir).filter(f => f.endsWith(".node"));

    if (nodeFiles.length > 0 && dllFiles.length === 0 && native.npm.startsWith("win32")) {
      console.log(`  sharp native package missing DLLs, re-downloading ${sharpNativePkg}...`);
      const tarballUrl = await getNpmTarballUrl(sharpNativePkg);
      if (tarballUrl) {
        const cachePath = path.join(DOWNLOAD_CACHE, `${sharpNativePkg.replace("/", "-")}.tgz`);
        if (!skipDownload) await downloadFile(tarballUrl, cachePath);
        if (fs.existsSync(cachePath)) {
          const extractDir = path.join(DOWNLOAD_CACHE, "npm-extract");
          if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
          ensureDir(extractDir);
          execSync(`tar xzf "${cachePath}" -C "${extractDir}"`, { stdio: "ignore" });
          const pkgExtracted = path.join(extractDir, "package");
          if (fs.existsSync(pkgExtracted)) {
            // Overwrite with complete package (includes .node + .dll)
            fs.rmSync(sharpNativeDir, { recursive: true });
            copyDirRecursive(pkgExtracted, sharpNativeDir);
            console.log(`  Reinstalled ${sharpNativePkg} with DLLs`);
          }
          fs.rmSync(extractDir, { recursive: true });
        }
      }
    }
  }

  // ── better-sqlite3 (cross-platform only) ──
  if (!isSamePlatform) {
    // ... existing better-sqlite3 swap logic unchanged ...
  }
}
```

### 修复后的验证

1. 重新打包 Windows 版本
2. 检查 `@img/sharp-win32-x64/lib/` 是否包含 `libvips-42.dll` + `libvips-cpp-*.dll`
3. 重新扫描媒体库以生成 `posterBlur` 数据
4. 验证 `/api/images/?w=360` 返回 `Content-Type: image/webp`

### 已有数据的 Backfill

现有 Windows 用户升级后，DB 中的 `posterBlur` 仍为 null。重新扫描 library 即可 — 扫描器对已存在的电影会做全量 `UPDATE`，包含 `posterBlur` 字段。

## 诊断过程

1. Chrome DevTools 检查页面上的 `<img>` 元素 → 没有 `background-image`（blur placeholder）和 `filter: blur()` 样式
2. 调用 `/api/movies` API → 所有 movie 的 `posterBlur` 字段为 `null`
3. 检查图片响应 → `Content-Type: image/jpeg`（应为 `image/webp`），确认 sharp 不可用
4. 检查安装目录 → `@img/sharp-win32-x64/lib/` 只有 `.node` 文件，缺少 `.dll`
5. 对比开发环境 `npm install` 后的目录 → 有 `.node` + 2 个 `.dll`，sharp 正常工作
6. 直接用打包的 Node.js 加载 sharp → `ERR_DLOPEN_FAILED`
7. 分析打包脚本 → `swapNativeModules` 在 same-platform 时跳过，Next.js standalone 的 `@vercel/nft` 不追踪 `.dll` 文件
8. 确认 Mac 不受影响 — macOS 的 sharp native addon 是静态链接 libvips 的
