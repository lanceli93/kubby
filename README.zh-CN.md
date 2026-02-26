[English](README.md) | [中文](README.zh-CN.md)

# Kubby

自托管电影服务器，在 Jellyfin 的基础上加了一些它没有的个人元数据功能。用 Next.js 写的。

![Kubby 截图](docs/screenshots/hero.png)

## 基础功能

- Jellyfin 风格的深色 UI，浏览/详情/播放的布局都比较熟悉
- 直接兼容已有的 Jellyfin 和 Kodi 媒体库（NFO + 文件夹结构，不用重新整理）
- TMDB 刮削器，自动拉取元数据、海报、演员照片和传记
- 浏览器内播放，带进度记录，支持多碟电影
- 中英文双语界面

## Kubby 独有的功能

### 自定义多维度评分

按你自己定义的维度给电影打分——剧情、摄影、配乐，随你定。然后可以按任意单个维度排序整个片库。

库里有 500 部电影，今晚想看摄影好的？按"摄影"排个序，从头挑就行。

![多维度评分](docs/screenshots/dimension-ratings.png)

### 海报和演员徽章

浏览时卡片上直接显示你的个人评分、分辨率（4K/1080p 等）、演员等级（S/A/B/...）。每个用户可以分别配置，不想看的关掉就好。

![卡片徽章](docs/screenshots/card-badges.png)

### 演员照片墙

给你关注的演员上传照片。瀑布流布局（类似 Google Photos），点开有灯箱查看器。

![演员照片墙](docs/screenshots/actor-gallery.png)

### 按出演年龄排序影片

演员详情页里，可以按出演时的年龄排序影片列表。想追溯某个演员的生涯轨迹，或者好奇他们 25 岁时演了什么，排一下就知道了。

![按年龄排序](docs/screenshots/filmography-age.png)

### 外部播放器

浏览器放不了 HEVC 或 DTS？一键打开 IINA（macOS）或 PotPlayer（Windows）。可以切换本地文件播放和串流播放，看播放器和服务器是不是同一台机器。

![外部播放器](docs/screenshots/external-player.png)

### 视频书签

播放时按 B 快速书签，Shift+B 打开详细面板（选图标、加标签、写备注）。书签在进度条上显示为彩色圆点。内置 9 个图标，也可以自己上传。

在电影详情页可以回看所有书签。

![视频书签](docs/screenshots/bookmarks.png)

### 分类搜索

在一个搜索框里同时搜电影、演员和你的书签。按分类过滤缩小范围。

![搜索增强](docs/screenshots/search.png)

## 快速开始（开发）

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)，设置向导会引导你创建管理员账号和添加媒体库。

## 安装（macOS）

### 1. 下载

从 [Releases](https://github.com/kubby-app/kubby/releases) 页面下载 `Kubby.dmg`。

### 2. 安装

1. 双击 `Kubby.dmg` 打开
2. 把 **Kubby.app** 拖到 **Applications** 文件夹
3. 推出 DMG

### 3. 首次启动

macOS 默认会拦截未签名的应用。第一次打开 Kubby：

1. 打开 **Applications** 文件夹，**右键** Kubby → **打开**
2. 在弹窗里点 **打开**

只需要这一次。之后双击就能正常打开。

也可以：系统设置 → 隐私与安全性 → 往下翻 → 点 **仍要打开**。

### 启动后会发生什么

- 在 `http://localhost:3000` 跑起一个本地服务
- 自动打开浏览器
- Dock 栏和菜单栏（右上角）会出现 Kubby 图标
- 数据存在 `~/Library/Application Support/Kubby/`

### 退出

右键 Dock 里的 Kubby 图标 → **退出**，或者点菜单栏托盘图标 → **退出**。

### 卸载

1. 把 Kubby 从 Applications 拖到废纸篓
2. （可选）删除用户数据：`rm -rf ~/Library/Application\ Support/Kubby`

### 关于 macOS 门禁（Gatekeeper）

| 状态 | 用户体验 |
|------|---------|
| **未签名**（目前） | 弹出"无法打开"对话框，右键 → 打开可以绕过（一次） |
| **已签名**（Developer ID，$99/年） | 提示"来自已识别的开发者"，直接点打开就行 |
| **签名 + 公证** | 没有任何警告，跟 App Store 装的一样 |

## 安装（Windows）

### 1. 下载

从 [Releases](https://github.com/kubby-app/kubby/releases) 页面下载 `KubbySetup.exe`。

### 2. 安装

1. 双击 `KubbySetup.exe`
2. 跟着安装向导走（选安装路径 → 安装）
3. 在完成页面勾选 **启动 Kubby**

安装器会创建开始菜单和桌面快捷方式。

### 3. 首次启动

Windows SmartScreen 可能会对未签名应用弹出警告。点 **更多信息** → **仍要运行**。

### 启动后会发生什么

- 在 `http://localhost:3000` 跑起一个本地服务
- 自动打开浏览器
- 系统托盘（右下角）出现 Kubby 图标
- 数据存在 `%LOCALAPPDATA%\Kubby\`

### 退出

右键系统托盘里的 Kubby 图标 → **退出**。这会关掉所有后台进程（kubby.exe 和 node.exe）。

### 升级

跑一下新版的 `KubbySetup.exe` 就行。它会自动关掉正在运行的实例，覆盖安装，数据不会丢。

### 卸载

控制面板 → 程序和功能 → Kubby → 卸载。或者用开始菜单里的 **卸载 Kubby** 快捷方式。

用户数据在 `%LOCALAPPDATA%\Kubby\` 里会保留。想彻底删干净的话手动删一下。

## 安装（Docker / Linux / NAS）

支持 **amd64** 和 **arm64**。群晖、威联通、Unraid 和各种 Linux 服务器都能跑。

### Docker Compose（推荐）

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

```bash
docker compose up -d
```

打开 `http://<你的服务器IP>:3000`。

### Docker CLI

```bash
docker run -d \
  --name kubby \
  -p 3000:3000 \
  -v kubby-data:/data \
  -v /path/to/your/movies:/media \
  --restart unless-stopped \
  ghcr.io/kubby-app/kubby:latest
```

### 挂载目录

| 挂载点 | 用途 |
|--------|------|
| `/data` | 数据库、配置、日志、元数据（一定要持久化！） |
| `/media` | 你的媒体库文件夹（读写，Kubby 会往里面写 NFO 和海报文件） |

### 更新

```bash
docker compose pull && docker compose up -d
```

### 本地构建镜像

```bash
git clone <repo> && cd kubby
docker build -t kubby .
docker run -d -p 3000:3000 -v kubby-data:/data kubby
```

## 从源码构建

### 前置依赖

- Node.js 22+
- Go 1.25+
- npm

### 打包

```bash
npm install
npx tsx scripts/package.ts                       # macOS → Kubby.dmg
npx tsx scripts/package.ts --platform win-x64    # Windows → KubbySetup.exe
```

每个安装包大约 80-90 MB，里面包含：
- Go 启动器（系统托盘 + 进程管理）
- Node.js 运行时
- ffprobe 二进制文件
- Next.js 独立服务器

加 `--skip-build` 跳过 Next.js 重新构建，加 `--skip-download` 复用已缓存的二进制文件。Windows 包可以在 macOS 上交叉构建（原生模块会自动替换）。

### 跨平台打包

```bash
npx tsx scripts/package.ts --platform darwin-arm64   # macOS Apple Silicon
npx tsx scripts/package.ts --platform darwin-x64     # macOS Intel
npx tsx scripts/package.ts --platform win-x64        # Windows
```

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 16 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v4 |
| 数据库 | SQLite (better-sqlite3, WAL 模式) |
| 认证 | NextAuth.js v5 (Credentials + JWT) |
| 启动器 | Go (getlantern/systray) |

## 许可证

GPL-2.0
