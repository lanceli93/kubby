# Kubby 打包分发技术指南

## 架构概览

Kubby 是一个 Next.js Web 应用，需要 Node.js 运行时才能运行。为了让普通用户能像安装 Jellyfin 一样一键安装使用，我们采用以下方案：

```
用户双击 kubby.exe / Kubby.app
        ↓
  Go 启动器 (8-9MB)
        ↓ 启动子进程
  Node.js 运行时 (bundled, ~116MB)
        ↓ 执行
  Next.js standalone server.js
        ↓ 监听
  http://localhost:3000
        ↓ 自动打开
  默认浏览器
```

## 技术选型：为什么用 Go 启动器

### 问题

Next.js 应用需要 `node server.js` 来运行。直接让用户安装 Node.js 再命令行启动不现实。需要一个"壳"来：
1. 内嵌 Node.js 运行时
2. 管理 Node.js 子进程生命周期
3. 提供系统托盘（菜单栏图标 + 退出功能）
4. 自动打开浏览器
5. 管理配置和 AUTH_SECRET

### 对比方案

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Electron** | 完整窗口管理，成熟生态 | 打包体积 200MB+，Kubby 本身是 Web 应用不需要窗口 |
| **Tauri** | Rust 性能，体积小 | 学习曲线陡，对 Node.js 子进程管理不如 Go 方便 |
| **Go 启动器** (当前) | 单文件 ~9MB，交叉编译零依赖，systray 库成熟 | 无窗口渲染能力（但 Kubby 不需要） |
| **Shell 脚本** | 最简单 | Windows 不友好，无系统托盘，不能隐藏终端窗口 |

**选择 Go 的理由**：Kubby 的 UI 在浏览器里，启动器只需要做进程管理 + 托盘，Go 的单二进制 + 跨平台编译完美匹配这个需求。

## 打包产物结构

### macOS (.app bundle → .dmg)

```
Kubby.app/
└── Contents/
    ├── Info.plist              # Bundle 元数据 + 图标引用
    ├── MacOS/
    │   └── kubby              # Go 启动器 (Mach-O arm64)
    └── Resources/
        ├── kubby.icns          # App 图标 (多分辨率)
        ├── node/
        │   └── bin/node        # Node.js 运行时
        ├── bin/
        │   └── ffprobe         # 视频探测工具
        └── server/             # Next.js standalone
            ├── server.js
            ├── package.json
            ├── node_modules/
            ├── .next/
            └── public/
```

Go 启动器通过 `getResourceDir()` 检测 `.app` bundle：如果 `../Resources` 目录存在，就从那里加载资源；否则回退到 exe 同级目录（Windows/Linux 布局）。

### Windows (flat → NSIS .exe installer)

```
C:\Program Files\Kubby\          # NSIS 安装后
├── kubby.exe                    # Go 启动器 (PE32+ GUI, 无控制台窗口)
├── node\
│   └── node.exe                 # Node.js 运行时
├── bin\
│   └── ffprobe.exe              # 视频探测工具
├── server\                      # Next.js standalone
│   ├── server.js
│   ├── node_modules\
│   ├── .next\
│   └── public\
└── uninstall.exe                # NSIS 卸载器
```

#### Windows 上为什么有多个 .exe

| 进程 | 常驻? | 说明 |
|------|-------|------|
| `kubby.exe` | 是 | Go 启动器。`-H=windowsgui` 编译，无控制台窗口。提供系统托盘。 |
| `node.exe` | 是 | Node.js 运行时，由 kubby.exe 作为子进程启动。可能 fork worker 子进程。 |
| `ffprobe.exe` | **否** | 只在扫描媒体库时短暂调用（每个视频几百毫秒），扫完自动退出。 |

#### Windows 进程树管理

```
kubby.exe (Go 启动器, GUI, 系统托盘)
  └── node.exe (Next.js server)
       └── node.exe (worker, 可能有多个)
```

退出时，Go 启动器用 `taskkill /F /T /PID {pid}` 杀掉整棵进程树（`/T` = tree kill）。NSIS 安装/卸载也用 `taskkill /F /T /IM kubby.exe` 确保无残留。

## 关键技术细节

### 1. Next.js Standalone 模式

`next.config.ts` 中 `output: "standalone"` 让 `next build` 产出一个自包含的 `server.js` + 最小化 `node_modules/`，只需 `node server.js` 即可运行，不需要完整的 `node_modules/`。

**注意**：standalone 输出会镜像项目在文件系统中的完整路径。打包脚本用 `findStandaloneRoot()` 递归查找包含 `server.js` + `node_modules/` 的目录来定位实际根目录。

### 2. Native 模块交叉编译

standalone 输出包含平台相关的 native 模块（`.node` 文件），在 macOS 上构建只会包含 macOS 版本。交叉打包时需要替换：

| 模块 | 来源 | 替换方式 |
|------|------|---------|
| **better-sqlite3** | GitHub releases 预编译 | 下载 `better-sqlite3-v{ver}-node-v{abi}-{os}-{arch}.tar.gz`，替换 `build/Release/better_sqlite3.node` |
| **sharp** | npm registry | 下载 `@img/sharp-{os}-{arch}` 和 `@img/sharp-libvips-{os}-{arch}` 包 |

**坑点**：Next.js standalone 在 **两个位置** 放置 native 模块：
- `server/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
- `server/.next/node_modules/better-sqlite3-{hash}/build/Release/better_sqlite3.node`

两个都必须替换，否则会报 `ERR_DLOPEN_FAILED: not a valid Win32 application`。

### 3. 数据目录与配置

数据目录（DB、配置、日志、元数据）和安装目录完全分离：

| 平台 | 安装目录 | 数据目录 |
|------|---------|---------|
| macOS | `/Applications/Kubby.app` | `~/Library/Application Support/Kubby/` |
| Windows | `C:\Program Files\Kubby\` | `%LOCALAPPDATA%\Kubby\` |
| Linux | 自定义 | `~/.local/share/kubby/` |

通过 `KUBBY_DATA_DIR` 环境变量传给 Node.js（`src/lib/paths.ts` 统一管理）。不设置时回退到 `process.cwd()/data/`（开发模式兼容）。

数据目录结构：
```
~/Library/Application Support/Kubby/    # 或 %LOCALAPPDATA%\Kubby\
├── kubby.db                            # SQLite 数据库
├── kubby.db-wal
├── auth-secret                         # 自动生成的 AUTH_SECRET (64 hex chars)
├── config.json                         # {"port": 3000}
├── logs/
│   └── kubby.log                       # Node.js 服务日志
└── metadata/
    └── people/                         # 演员照片（扫描后生成）
```

### 4. AUTH_SECRET 自动管理

NextAuth 需要 `AUTH_SECRET` 环境变量。Go 启动器在首次运行时自动生成 32 字节随机值（64 hex 字符），写入 `{dataDir}/auth-secret`，后续启动读取同一文件。通过环境变量传给 Node.js 进程。

### 5. Windows 控制台窗口隐藏

Go 启动器用 `-H=windowsgui` 编译，自身不显示控制台。但子进程 `node.exe` 默认会创建新控制台窗口。通过 `proc_windows.go` 设置：

```go
cmd.SysProcAttr = &syscall.SysProcAttr{
    HideWindow:    true,
    CreationFlags: 0x08000000, // CREATE_NO_WINDOW
}
```

同时 Node.js 的 stdout/stderr 只写入日志文件（不写 `os.Stdout`），避免 GUI 进程无 stdout 导致的 `EPIPE: broken pipe` 错误。

### 6. Windows 图标嵌入

Go 默认不嵌入 Windows 资源（图标、版本信息）。使用 `go-winres` 工具：

```bash
# launcher/winres/ 目录下:
# - winres.json: 定义图标、manifest、版本信息
# - icon.png: 256x256 应用图标
# 生成 .syso 文件（go build 自动链接）:
go-winres make --arch amd64
```

产出 `rsrc_windows_amd64.syso`，Go 编译时自动嵌入，使 kubby.exe 在资源管理器和任务栏显示图标。

### 7. Windows 系统托盘图标

**踩坑：`getlantern/systray` 在 Windows 上只接受 ICO 格式，传 PNG 会导致托盘图标为空白。**

解决方案：为 Windows 和 macOS 分别嵌入不同格式的图标：

```go
// icon.go
//go:embed assets/tray_icon.png   // macOS menu bar: 白色线条 PNG
var iconDataMac []byte

//go:embed assets/icon.ico         // Windows taskbar: ICO 格式
var iconDataWinICO []byte

func trayIcon() []byte {
    if runtime.GOOS == "windows" {
        return iconDataWinICO     // Windows 必须用 ICO
    }
    return iconDataMac            // macOS/Linux 用 PNG
}
```

ICO 文件生成：小尺寸（16/32/48）用 BMP 格式条目（NSIS 兼容），256px 用 PNG 压缩。`scripts/generate-icon.ts` 中通过 sharp 生成 RGBA 像素数据，手动构建 ICO 二进制格式（BITMAPINFOHEADER + 像素数据 + AND mask）。

macOS 的 tray icon 使用白色线条 + 透明背景的 PNG（适配菜单栏浅色/深色模式），而 Windows 使用完整彩色 ICO（蓝色 K 深色背景，在任何任务栏主题下清晰可见）。

### 8. macOS .icns 图标生成

`scripts/generate-icon.ts` 用 sharp 库从 SVG 生成多分辨率 PNG，再用 `iconutil` 转 `.icns`：

```bash
npx tsx scripts/generate-icon.ts
# 产出: launcher/assets/icon_1024.png, kubby.icns, tray_icon.png
```

图标设计与 `app-header.tsx` 中的 `KubbyLogo` 组件一致：深色圆角方框 + 蓝色边框 + 蓝色 K 线条。

### 8. DMG 文件图标

macOS `.dmg` 文件默认显示通用磁盘映像图标。通过 resource fork 设置自定义图标：

```bash
sips -i icon.png                           # 给 PNG 添加 resource fork
DeRez -only icns icon.png > icon.rsrc      # 提取 icon 资源
Rez -append icon.rsrc -o Kubby.dmg         # 写入 DMG 的 resource fork
SetFile -a C Kubby.dmg                     # 标记"使用自定义图标"
```

## 构建命令

```bash
# macOS (当前平台)
npx tsx scripts/package.ts
# 产出: dist/Kubby.app + dist/Kubby.dmg

# Windows (从 macOS 交叉编译)
npx tsx scripts/package.ts --platform win-x64
# 产出: dist/kubby-win-x64/ + dist/KubbySetup.exe

# 加速选项
npx tsx scripts/package.ts --skip-build       # 跳过 Next.js 构建
npx tsx scripts/package.ts --skip-download    # 跳过 Node.js/ffprobe 下载

# 重新生成图标
npx tsx scripts/generate-icon.ts
```

## Docker 镜像 (Linux / NAS)

Docker 是 Linux 和 NAS（群晖、威联通、Unraid）用户的推荐部署方式。不需要 Go 启动器 — Docker 容器本身就是进程管理器。

### 架构

```
Dockerfile (多阶段构建)
  Stage 1: node:25-slim — npm ci + next build
  Stage 2: node:25-slim — 仅复制 standalone 产物 + ffprobe
```

与桌面打包的区别：

| | 桌面 (macOS/Windows) | Docker |
|---|---|---|
| 进程管理 | Go 启动器 (systray + 子进程) | Docker (`restart: unless-stopped`) |
| Node.js | 内嵌二进制 (~116MB) | 基础镜像自带 |
| ffprobe | 内嵌静态编译 | `apt install ffmpeg` |
| Native 模块 | 需要手动替换目标平台 | 容器内 `npm ci` 自动编译正确架构 |
| 数据目录 | OS 标准位置 | `/data` volume mount |
| 多架构 | 每个架构单独打包 | `docker buildx` 一次构建 amd64 + arm64 |

### 多架构支持 (amd64 + arm64)

通过 `docker buildx` + QEMU 模拟实现交叉构建：

```bash
# 本地构建当前架构
docker build -t kubby:test .

# 构建并推送多架构镜像
docker buildx build --platform linux/amd64,linux/arm64 \
  -t ghcr.io/kubby-app/kubby:latest --push .
```

每一层都天然支持多架构：
- `node:25-slim` — Docker Hub 提供 amd64/arm64 变体
- `npm ci` — 在目标架构容器内编译 native 模块 (better-sqlite3, sharp)
- `apt install ffmpeg` — 包管理器自动安装对应架构

### standalone 路径处理

Next.js standalone 输出会镜像项目路径（受 Turbopack workspace root 检测影响）。Dockerfile 中用 `find` 动态定位：

```dockerfile
RUN STANDALONE_ROOT=$(find .next/standalone -name "server.js" \
      -not -path "*/node_modules/*" -exec dirname {} \; | head -1) && \
    cp -r "$STANDALONE_ROOT"/. /standalone/
```

### AUTH_SECRET 自动管理

Docker 环境下 AUTH_SECRET 处理方式与桌面略有不同：

```dockerfile
CMD if [ -z "$AUTH_SECRET" ]; then \
      if [ -f /data/auth-secret ]; then \
        export AUTH_SECRET=$(cat /data/auth-secret); \
      else \
        export AUTH_SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"); \
        echo "$AUTH_SECRET" > /data/auth-secret; \
      fi; \
    fi && node server.js
```

优先级：环境变量 > /data/auth-secret 文件 > 自动生成并持久化。

### Volume 挂载

| Mount | 用途 | 必须? |
|-------|------|------|
| `/data` | 数据库、配置、日志、auth-secret、元数据 | 是（否则容器重建丢数据） |
| `/media` (或自定义路径) | 用户的媒体库文件夹 | 是（只读即可） |

### docker-compose.yml 示例

```yaml
services:
  kubby:
    image: ghcr.io/kubby-app/kubby:latest
    ports:
      - "3000:3000"
    volumes:
      - kubby-data:/data
      - /path/to/your/movies:/media
    restart: unless-stopped

volumes:
  kubby-data:
```

## CI/CD

### 桌面安装包

`.github/workflows/release.yml` 在 `v*` tag push 时自动构建三个平台（darwin-arm64, darwin-x64, win-x64），产出 GitHub Release（draft）。支持 `workflow_dispatch` 手动触发测试构建。

**Node.js 版本**：CI runner 的 Node.js 版本必须与本地开发环境一致（当前为 Node 25），否则 `npm ci` 会因 `package-lock.json` 与 `package.json` 依赖解析不匹配而失败。

### Docker 镜像

`.github/workflows/docker.yml` 在 `v*` tag push 时用 `docker buildx` 构建 amd64 + arm64 双架构镜像，推送到 GitHub Container Registry (ghcr.io)。Docker 构建使用 `node:25-slim` 基础镜像，这是容器内自包含的环境，与 CI release workflow 的 Node 版本无关。

## CI 构建踩坑记录

### 1. Windows: Go 交叉编译环境变量语法

**问题**：`GOOS=windows GOARCH=amd64 go build ...` 是 Unix shell 语法，Windows runner 上会报 `'GOOS' is not recognized as an internal or external command`。

**解决**：通过 Node.js `execSync` 的 `env` 选项传递环境变量，而不是拼在命令字符串前面：

```typescript
// ❌ 错误：Unix-only 语法
run(`GOOS=${goOs} GOARCH=${goArch} go build -o "${dest}" .`);

// ✅ 正确：跨平台
run(`go build -o "${dest}" .`, {
  cwd: launcherDir,
  env: { GOOS: goOs, GOARCH: goArch, CGO_ENABLED: "0", GOPROXY: "direct" },
});
```

### 2. macOS: Next.js 构建时 SQLite 数据库锁冲突

**问题**：Next.js 构建阶段用多个 worker 并行收集页面数据（`Collecting page data using 2 workers`），每个 worker 都会 import `db/index.ts`，导致多个进程同时打开同一个 SQLite 数据库文件并执行迁移，触发 `SqliteError: database is locked (SQLITE_BUSY)`。

**解决**：将 `src/lib/db/index.ts` 中的数据库连接从模块顶层立即执行改为懒初始化。通过 `Proxy` 包装 `db` 导出，只在首次实际访问时才打开连接和执行迁移：

```typescript
// ❌ 错误：模块 import 时立即打开连接
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite, { schema });

// ✅ 正确：首次使用时才初始化
let _db: BetterSQLite3Database<typeof schema> | null = null;
function initDb() { /* ... */ }
export const db = new Proxy({} as BetterSQLite3Database<typeof schema>, {
  get(_target, prop, receiver) {
    return Reflect.get(initDb(), prop, receiver);
  },
});
```

### 3. npm ci 报 lock file 不同步

**问题**：`npm ci` 报 `Missing: @swc/helpers@0.5.19 from lock file`。本地 `npm install` 显示 "up to date" 但 CI 失败。

**原因**：本地 Node 版本（如 v25）和 CI Node 版本（如 v22）不同，不同版本的 npm 对依赖树的解析方式有差异，导致 `package-lock.json` 在另一个版本上被视为不同步。

**解决**：保持 CI 的 `node-version` 与本地开发环境一致。在 `release.yml` 中更新 `node-version` 即可。

## 已知限制

- **未签名**：macOS 需要用户右键打开绕过 Gatekeeper；Windows 可能触发 SmartScreen 警告
- **无自动更新**：用户需要手动下载新版本重新安装
- **单架构**：每个安装包只包含一个架构的 native 模块，不支持 universal binary
