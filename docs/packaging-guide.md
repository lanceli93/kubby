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

### 7. macOS .icns 图标生成

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

## CI/CD

`.github/workflows/release.yml` 在 `v*` tag push 时自动构建四个平台（darwin-arm64, darwin-x64, win-x64, linux-x64），产出 GitHub Release。

## 已知限制

- **未签名**：macOS 需要用户右键打开绕过 Gatekeeper；Windows 可能触发 SmartScreen 警告
- **无自动更新**：用户需要手动下载新版本重新安装
- **单架构**：每个安装包只包含一个架构的 native 模块，不支持 universal binary
