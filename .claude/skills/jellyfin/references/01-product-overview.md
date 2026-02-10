# Jellyfin 产品概览

## 1. 产品定位

### 1.1 Jellyfin 是什么

Jellyfin 是一个**自由开源的媒体系统**，让用户能够管理和串流自己的数字媒体内容。它是一个客户端-服务端架构的应用：服务端负责组织、转码和分发媒体文件，客户端（Web、移动端、TV 端等）负责呈现和播放。

核心理念：**你的媒体，你做主**。用户完全拥有自己的数据，无需订阅、无广告、无追踪。

### 1.2 解决的核心问题

| 问题 | Jellyfin 的解决方案 |
|------|---------------------|
| 媒体文件分散在不同设备 | 统一媒体库管理，集中存储与索引 |
| 不同设备格式兼容性差 | 实时转码（HLS/Progressive），适配客户端能力 |
| 远程访问自有媒体困难 | 服务端部署后支持远程串流访问 |
| 媒体元数据管理混乱 | 自动刮削元数据（封面、简介、评分等） |
| 商业方案需要付费/有限制 | 完全免费开源，无功能锁定 |

### 1.3 与竞品的定位差异

| 维度 | Jellyfin | Plex | Emby |
|------|----------|------|------|
| **授权模式** | GPLv2 完全开源 | 闭源 + Plex Pass 订阅 | 部分开源 → 闭源 |
| **费用** | 完全免费 | 基础免费，高级功能付费 | 基础免费，Premiere 付费 |
| **数据主权** | 纯自托管，无云依赖 | 需 Plex 账户，依赖云服务 | 自托管但部分闭源 |
| **隐私** | 无遥测、无追踪 | 有使用数据收集 | 有使用数据收集 |
| **插件生态** | 开放插件系统 | 封闭 Channel 系统 | 半开放插件系统 |
| **历史渊源** | 从 Emby 3.5.2 分叉而来 | 独立项目 | Jellyfin 的前身 |

---

## 2. 核心用户场景

### 2.1 个人/家庭媒体中心

- 在 NAS 或家庭服务器上部署 Jellyfin，管理电影、电视剧、音乐、照片
- 家庭成员通过不同设备（手机、平板、智能电视）访问共享媒体库
- 为儿童设置家长控制（内容评级过滤）

### 2.2 远程媒体串流

- 出差或旅行时远程访问家中的媒体库
- 服务端自动转码以适配低带宽网络环境
- 支持断点续播（跨设备同步播放进度）

### 2.3 音乐库管理与播放

- 管理个人音乐收藏，自动获取专辑封面、歌词
- 即时混音（Instant Mix）功能智能生成播放列表
- 歌词同步显示

### 2.4 直播电视与录制

- 接入 TV Tuner 设备观看直播电视
- 电子节目指南（EPG）浏览与搜索
- 定时录制、系列录制、DVR 功能

### 2.5 社交观影（SyncPlay）

- 多人同步观影，实时同步播放进度
- 创建观影房间，邀请好友加入
- 共享播放控制（暂停/播放/跳转同步）

### 2.6 媒体管理与策展

- 创建自定义合集（Collections）分组相关影片
- 创建和管理播放列表
- 元数据手动编辑与修正
- 远程图片搜索与替换

---

## 3. 功能全景图

```
Jellyfin
├── 媒体库管理
│   ├── 媒体库创建与配置（电影/剧集/音乐/书籍/照片/混合）
│   ├── 媒体路径管理（添加/移除/更新）
│   ├── 自动扫描与刮削
│   ├── 元数据管理（编辑/搜索/刷新）
│   ├── 图片管理（封面/背景/Logo）
│   ├── 远程图片提供者
│   └── NFO 文件配置
│
├── 媒体浏览
│   ├── 首页（个性化推荐/继续观看/最新添加）
│   ├── 电影（推荐/分类/合集/工作室）
│   ├── 电视剧（推荐/下一集/即将播出/分类）
│   ├── 音乐（推荐/专辑/歌手/歌曲/播放列表/分类）
│   ├── 照片与家庭视频
│   ├── 收藏夹
│   ├── 列表浏览与过滤
│   └── 全局搜索
│
├── 播放系统
│   ├── 视频播放（OSD 控件）
│   ├── 音频播放
│   ├── 播放队列管理
│   ├── 播放进度追踪（已播/未播/断点续播）
│   ├── 转码引擎
│   │   ├── HLS 动态转码
│   │   ├── Progressive 转码
│   │   └── 通用音频转码
│   ├── 字幕管理（内嵌/外挂/远程搜索下载）
│   ├── 歌词显示与管理
│   ├── Trickplay（缩略图时间轴预览）
│   └── 视频附件提取
│
├── 用户系统
│   ├── 用户认证
│   │   ├── 用户名密码登录
│   │   ├── QuickConnect 快速连接
│   │   ├── 忘记密码/重置密码
│   │   └── 外部认证提供者
│   ├── 用户管理（创建/删除/编辑）
│   ├── 用户策略与权限
│   ├── 家长控制
│   ├── 用户偏好设置
│   │   ├── 显示偏好
│   │   ├── 首页布局
│   │   ├── 播放偏好
│   │   ├── 字幕偏好
│   │   └── 控件偏好
│   └── 用户个人资料
│
├── 社交功能
│   ├── SyncPlay 同步播放
│   │   ├── 创建/加入/离开群组
│   │   ├── 群组播放控制（播放/暂停/跳转/停止）
│   │   ├── 播放列表管理
│   │   ├── 缓冲同步
│   │   └── 重复/随机模式
│   └── 合集管理
│
├── 直播电视（Live TV）
│   ├── Tuner 设备管理
│   ├── 指南提供者配置
│   ├── 频道浏览
│   ├── 电子节目指南（EPG）
│   ├── 节目推荐
│   ├── 录制管理
│   │   ├── 单次定时器
│   │   ├── 系列定时器
│   │   └── 录制回看
│   └── 直播串流
│
├── 管理后台（Dashboard）
│   ├── 仪表板总览（活跃会话/媒体统计/存储）
│   ├── 服务器设置
│   │   ├── 通用配置
│   │   ├── 网络配置
│   │   ├── 品牌自定义（Logo/登录页）
│   │   └── 本地化设置
│   ├── 媒体库管理
│   │   ├── 库配置
│   │   ├── 显示设置
│   │   ├── 元数据设置
│   │   └── NFO 设置
│   ├── 播放设置
│   │   ├── 恢复播放
│   │   ├── 串流设置
│   │   ├── 转码设置
│   │   └── Trickplay 设置
│   ├── 用户管理
│   │   ├── 用户列表
│   │   ├── 添加用户
│   │   ├── 访问控制
│   │   ├── 家长控制
│   │   ├── 密码管理
│   │   └── 用户画像
│   ├── Live TV 管理
│   │   ├── 调谐器管理
│   │   ├── 指南提供者
│   │   └── 录制设置
│   ├── 设备管理
│   ├── API 密钥管理
│   ├── 计划任务管理
│   ├── 活动日志
│   ├── 服务器日志
│   ├── 备份与恢复
│   └── 插件管理
│       ├── 已安装插件
│       ├── 插件目录（安装/卸载/启用/禁用）
│       └── 仓库管理
│
├── 插件系统
│   ├── 插件安装/卸载/启用/禁用
│   ├── 插件配置
│   ├── 包仓库管理
│   └── 插件配置页面托管
│
├── 会话管理
│   ├── 活跃会话查看
│   ├── 远程控制（播放/暂停/发送消息）
│   ├── 设备能力上报
│   └── 会话消息推送
│
└── 初始化向导（Wizard）
    ├── 欢迎/开始
    ├── 用户创建
    ├── 媒体库配置
    ├── 偏好设置
    ├── 远程访问配置
    └── 完成
```

---

## 4. 功能模块分类

### 4.1 核心模块 — 媒体库与播放

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| 媒体项管理 | 媒体项 CRUD、查询、过滤 | `ItemsController`, `FilterController` | `/list`, `/details` |
| 媒体库结构 | 虚拟文件夹与媒体路径管理 | `LibraryStructureController`, `LibraryController` | Dashboard `/libraries` |
| 元数据管理 | 元数据编辑、远程搜索、刷新 | `ItemUpdateController`, `ItemLookupController`, `ItemRefreshController` | `/metadata` 编辑器 |
| 图片管理 | 封面/背景/Logo 的上传与获取 | `ImageController`, `RemoteImageController` | 详情页内嵌 |
| 视频播放 | 视频串流（Progressive/HLS） | `VideosController`, `DynamicHlsController`, `HlsSegmentController` | `/video` |
| 音频播放 | 音频串流 | `AudioController`, `UniversalAudioController` | 底部播放栏 |
| 播放状态 | 播放进度追踪与同步 | `PlaystateController`, `MediaInfoController` | 全局 |
| 转码 | 实时转码与 Trickplay | `DynamicHlsController`, `TrickplayController` | 播放器内嵌 |
| 字幕 | 字幕获取/上传/远程搜索 | `SubtitleController` | 播放器内嵌 |
| 歌词 | 歌词显示/上传/远程搜索 | `LyricsController` | `/lyrics` |

### 4.2 内容类型模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| 电影 | 电影推荐、合集、分类 | `MoviesController`, `CollectionController` | `/movies` |
| 电视剧 | 剧集/季/下一集/即将播出 | `TvShowsController` | `/tv` |
| 音乐 | 歌手/专辑/歌曲/即时混音 | `ArtistsController`, `MusicGenresController`, `InstantMixController` | `/music` |
| 播放列表 | 播放列表 CRUD 与协作 | `PlaylistsController` | 音乐子页 |
| 分类索引 | 分类/工作室/人物/年份 | `GenresController`, `StudiosController`, `PersonsController`, `YearsController` | 各列表页 |
| 频道 | 频道内容聚合 | `ChannelsController` | 列表页 |
| 预告片 | 预告片聚合 | `TrailersController` | 详情页 |

### 4.3 用户模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| 认证 | 登录/登出/密码重置 | `UserController` | `/login`, `/forgotpassword` |
| QuickConnect | 设备快速配对认证 | `QuickConnectController` | `/quickconnect` |
| 用户管理 | 用户 CRUD、策略配置 | `UserController` | Dashboard `/users` |
| 用户偏好 | 显示/播放/字幕/首页偏好 | `DisplayPreferencesController` | `/mypreferences*` |
| 用户媒体库 | 收藏夹/评分/最新内容 | `UserLibraryController`, `UserViewsController` | `/favorites`, `/home` |
| 会话 | 服务器选择与连接管理 | `SessionController` | `/addserver`, `/selectserver` |

### 4.4 社交模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| SyncPlay | 多人同步播放/群组管理 | `SyncPlayController`, `TimeSyncController` | 播放器内嵌 |
| 合集 | 自定义媒体合集 | `CollectionController` | 电影子页 |

### 4.5 直播电视模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| Live TV 核心 | 频道/节目/EPG/推荐 | `LiveTvController` | `/livetv` |
| 录制管理 | 定时器/系列定时器/录制 | `LiveTvController` | Live TV 子页 |
| Tuner 管理 | 调谐器设备管理 | `LiveTvController` | Dashboard `/livetv/tuner` |
| Guide 提供者 | 节目指南源配置 | `LiveTvController` | Dashboard `/livetv/guide` |

### 4.6 管理模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| 仪表板 | 服务器状态/活跃会话/统计 | `DashboardController`, `SystemController` | `/dashboard` |
| 服务器配置 | 通用/网络/品牌/本地化 | `ConfigurationController`, `BrandingController`, `LocalizationController` | Dashboard `/settings`, `/networking`, `/branding` |
| 设备管理 | 客户端设备注册与管理 | `DevicesController` | Dashboard `/devices` |
| API 密钥 | 第三方 API 访问令牌 | `ApiKeyController` | Dashboard `/keys` |
| 计划任务 | 后台任务管理与调度 | `ScheduledTasksController` | Dashboard `/tasks` |
| 活动日志 | 系统事件与操作审计 | `ActivityLogController` | Dashboard `/activity` |
| 服务器日志 | 日志文件查看 | `SystemController` | Dashboard `/logs` |
| 备份恢复 | 服务器配置备份与恢复 | `BackupController` | Dashboard `/backups` |
| 存储监控 | 磁盘空间监控 | `SystemController` | Dashboard 首页 |

### 4.7 扩展模块

| 子模块 | 职责 | 关键 Controller | 前端页面 |
|--------|------|----------------|----------|
| 插件管理 | 安装/卸载/启用/禁用 | `PluginsController` | Dashboard `/plugins` |
| 包仓库 | 插件源管理 | `PackageController` | Dashboard `/plugins/repositories` |
| 插件配置 | 插件配置页托管 | `DashboardController` | `/configurationpage` |
| 搜索 | 全局搜索提示 | `SearchController` | `/search` |

---

## 5. 前端应用结构

Jellyfin Web 前端采用**多应用（Multi-App）架构**，在 `src/apps/` 下划分为 4 个子应用：

### 5.1 应用列表

| 应用 | 目录 | 权限要求 | 功能范围 |
|------|------|----------|----------|
| **stable** | `src/apps/stable/` | 普通用户 + 公开 | 主应用：媒体浏览、播放、用户偏好设置、登录 |
| **experimental** | `src/apps/experimental/` | 普通用户 + 公开 | 实验版主应用：新 UI 组件（React化的电影/剧集/音乐/直播页面） |
| **dashboard** | `src/apps/dashboard/` | 管理员 | 管理后台：服务器配置、用户管理、库管理、插件、任务、日志 |
| **wizard** | `src/apps/wizard/` | 初始化向导 | 首次安装向导：服务器配置、用户创建、库设置 |

### 5.2 Stable 应用路由（主应用）

**用户路由（需认证）：**

| 路由 | 类型 | 功能 |
|------|------|------|
| `/home` | Legacy | 首页（推荐/继续观看/最新添加） |
| `/movies` | Legacy | 电影浏览（推荐/分类/合集） |
| `/tv` | Legacy | 电视剧浏览（推荐/下一集/即将播出） |
| `/music` | Legacy | 音乐浏览（推荐/专辑/歌手/歌曲） |
| `/livetv` | Legacy | 直播电视（频道/指南/录制） |
| `/details` | Legacy | 媒体详情页 |
| `/list` | Legacy | 列表浏览页 |
| `/video` | Legacy | 视频播放器（全屏 OSD） |
| `/queue` | Legacy | 播放队列 |
| `/lyrics` | Legacy | 歌词显示 |
| `/search` | Async | 全局搜索 |
| `/userprofile` | Async | 用户个人资料 |
| `/quickconnect` | Async | QuickConnect 配对 |
| `/mypreferencesmenu` | Async | 用户偏好菜单 |
| `/mypreferencesdisplay` | Legacy | 显示偏好 |
| `/mypreferenceshome` | Legacy | 首页布局偏好 |
| `/mypreferencesplayback` | Legacy | 播放偏好 |
| `/mypreferencessubtitles` | Legacy | 字幕偏好 |
| `/mypreferencescontrols` | Legacy | 控件偏好 |

**公开路由（无需认证）：**

| 路由 | 功能 |
|------|------|
| `/login` | 登录页 |
| `/addserver` | 添加服务器 |
| `/selectserver` | 选择服务器 |
| `/forgotpassword` | 忘记密码 |
| `/forgotpasswordpin` | 重置密码 PIN |

### 5.3 Experimental 应用路由

在 stable 基础上使用 React 重写了以下页面：

| 路由 | 说明 |
|------|------|
| `/home` | React 重写的首页 |
| `/movies` | React 重写的电影页 |
| `/tv` | React 重写的剧集页 |
| `/music` | React 重写的音乐页 |
| `/livetv` | React 重写的直播电视页 |
| `/homevideos` | React 重写的照片/家庭视频页 |
| `/video` | 新播放器控件 + Legacy 视图混合 |
| `/mypreferencesdisplay` | React 重写的显示偏好页 |

### 5.4 Dashboard 应用路由（管理后台）

| 路由 | 类型 | 功能 |
|------|------|------|
| `/dashboard` | Async | 仪表板首页 |
| `/dashboard/activity` | Async | 活动日志 |
| `/dashboard/backups` | Async | 备份管理 |
| `/dashboard/branding` | Async | 品牌自定义 |
| `/dashboard/devices` | Async | 设备管理 |
| `/dashboard/settings` | Async | 通用设置 |
| `/dashboard/keys` | Async | API 密钥管理 |
| `/dashboard/libraries` | Async | 媒体库管理 |
| `/dashboard/libraries/display` | Async | 库显示设置 |
| `/dashboard/libraries/metadata` | Async | 元数据设置 |
| `/dashboard/libraries/nfo` | Async | NFO 设置 |
| `/dashboard/livetv` | Async | Live TV 管理 |
| `/dashboard/livetv/recordings` | Async | 录制设置 |
| `/dashboard/livetv/guide` | Legacy | 指南提供者配置 |
| `/dashboard/livetv/tuner` | Legacy | 调谐器配置 |
| `/dashboard/logs` | Async | 服务器日志 |
| `/dashboard/networking` | Legacy | 网络配置 |
| `/dashboard/playback/resume` | Async | 恢复播放设置 |
| `/dashboard/playback/streaming` | Async | 串流设置 |
| `/dashboard/playback/transcoding` | Async | 转码设置 |
| `/dashboard/playback/trickplay` | Async | Trickplay 设置 |
| `/dashboard/plugins` | Async | 插件管理 |
| `/dashboard/plugins/:pluginId` | Async | 插件详情 |
| `/dashboard/plugins/repositories` | Async | 仓库管理 |
| `/dashboard/tasks` | Async | 计划任务 |
| `/dashboard/tasks/:id` | Async | 任务详情 |
| `/dashboard/users` | Async | 用户列表 |
| `/dashboard/users/add` | Async | 添加用户 |
| `/dashboard/users/access` | Async | 访问控制 |
| `/dashboard/users/parentalcontrol` | Async | 家长控制 |
| `/dashboard/users/password` | Async | 密码管理 |
| `/dashboard/users/profile` | Async | 用户画像 |
| `/metadata` | Legacy | 元数据编辑器 |
| `/configurationpage` | - | 插件配置页（服务端内容） |

### 5.5 Wizard 应用路由

| 路由 | 功能 |
|------|------|
| `/wizard/start` | 开始向导 |
| `/wizard/user` | 创建管理员用户 |
| `/wizard/library` | 配置媒体库 |
| `/wizard/settings` | 偏好设置 |
| `/wizard/remoteaccess` | 远程访问配置 |
| `/wizard/finish` | 完成设置 |

---

## 6. 后端 Controller 概览

Jellyfin Server 共有 **60 个 API Controller**，按功能分组如下：

### 6.1 系统与服务器管理（9 个）

| Controller | 职责 |
|-----------|------|
| `SystemController` | 系统信息、存储状态、服务器日志、重启/关机、Ping |
| `ConfigurationController` | 服务器配置读写、命名配置、默认元数据选项 |
| `ActivityLogController` | 活动日志查询 |
| `StartupController` | 首次安装向导 API |
| `BackupController` | 服务器配置备份与恢复 |
| `ScheduledTasksController` | 计划任务 CRUD、启动/停止 |
| `EnvironmentController` | 文件系统浏览（目录/驱动器/路径验证） |
| `DashboardController` | 插件配置页面聚合 |
| `TimeSyncController` | UTC 时间同步（SyncPlay 依赖） |

### 6.2 认证与用户（5 个）

| Controller | 职责 |
|-----------|------|
| `UserController` | 用户 CRUD、认证（密码/QuickConnect）、密码重置、策略配置 |
| `ApiKeyController` | API 密钥管理（创建/吊销/列表） |
| `QuickConnectController` | QuickConnect 设备配对流程 |
| `SessionController` | 会话管理、远程控制、能力上报、认证提供者查询 |
| `DevicesController` | 客户端设备注册与管理 |

### 6.3 媒体库与条目（13 个）

| Controller | 职责 |
|-----------|------|
| `ItemsController` | 媒体项查询、过滤、恢复播放列表、用户数据 |
| `LibraryController` | 库操作（刷新/删除/下载/相似项/主题曲）|
| `LibraryStructureController` | 虚拟文件夹与媒体路径结构管理 |
| `ItemRefreshController` | 单项元数据刷新触发 |
| `ItemUpdateController` | 媒体项元数据编辑 |
| `ItemLookupController` | 远程元数据搜索（电影/剧集/音乐/人物等） |
| `UserLibraryController` | 用户级别的媒体操作（收藏/评分/最新/特典） |
| `FilterController` | 过滤条件查询 |
| `SearchController` | 全局搜索提示 |
| `SuggestionsController` | 智能推荐 |
| `CollectionController` | 合集管理（创建/添加/移除） |
| `UserViewsController` | 用户媒体库视图 |
| `DisplayPreferencesController` | 显示偏好存取 |

### 6.4 内容类型（9 个）

| Controller | 职责 |
|-----------|------|
| `TvShowsController` | 剧集查询（下一集/即将播出/分季/分集） |
| `MoviesController` | 电影推荐 |
| `ArtistsController` | 歌手/专辑歌手查询 |
| `GenresController` | 分类查询 |
| `MusicGenresController` | 音乐分类查询（已废弃，统一到 Genres） |
| `StudiosController` | 工作室/制片公司查询 |
| `PersonsController` | 演职人员查询 |
| `YearsController` | 年份索引查询 |
| `TrailersController` | 预告片聚合（委托 ItemsController） |

### 6.5 播放与串流（9 个）

| Controller | 职责 |
|-----------|------|
| `AudioController` | 音频 Progressive 串流 |
| `VideosController` | 视频串流、版本合并/拆分 |
| `DynamicHlsController` | HLS 动态转码（主播放列表/变体/分片） |
| `UniversalAudioController` | 通用音频串流（自动选择最佳方式） |
| `HlsSegmentController` | HLS 分片获取（Legacy） |
| `VideoAttachmentsController` | 视频附件提取（字体等） |
| `MediaInfoController` | 播放信息协商、直播流开关、码率测试 |
| `PlaystateController` | 播放进度上报（开始/进度/停止/已播标记） |
| `TrickplayController` | 缩略图时间轴（HLS 播放列表 + 瓦片图片） |

### 6.6 媒体资源（5 个）

| Controller | 职责 |
|-----------|------|
| `ImageController` | 图片管理（上传/删除/获取各类图片/启动画面） |
| `RemoteImageController` | 远程图片搜索与下载 |
| `SubtitleController` | 字幕管理（获取/上传/删除/远程搜索下载/字体回退） |
| `LyricsController` | 歌词管理（获取/上传/删除/远程搜索下载） |
| `MediaSegmentsController` | 媒体分段信息（片头/片尾检测等） |

### 6.7 直播电视（2 个）

| Controller | 职责 |
|-----------|------|
| `LiveTvController` | Live TV 全功能（频道/节目/EPG/录制/定时器/Tuner/指南提供者） |
| `ChannelsController` | 频道内容聚合 |

### 6.8 社交功能（1 个）

| Controller | 职责 |
|-----------|------|
| `SyncPlayController` | 同步播放群组管理与播放控制（22 个端点） |

### 6.9 插件与包（2 个）

| Controller | 职责 |
|-----------|------|
| `PluginsController` | 插件生命周期管理（安装/卸载/启用/禁用/配置） |
| `PackageController` | 包信息查询、安装、仓库管理 |

### 6.10 播放列表与混音（2 个）

| Controller | 职责 |
|-----------|------|
| `PlaylistsController` | 播放列表 CRUD、协作用户管理、项目排序 |
| `InstantMixController` | 基于歌曲/专辑/歌手/分类生成即时混音 |

### 6.11 品牌与本地化（2 个）

| Controller | 职责 |
|-----------|------|
| `BrandingController` | 品牌选项与自定义 CSS（无需认证） |
| `LocalizationController` | 语言/国家/评级/本地化选项 |

### 6.12 客户端（1 个）

| Controller | 职责 |
|-----------|------|
| `ClientLogController` | 客户端日志上传 |

---

## 7. 总结

Jellyfin 是一个功能完备的自托管媒体系统，其功能覆盖从媒体管理、播放转码到社交观影、直播录制等完整的媒体消费链路。项目采用前后端分离架构：

- **后端**（C# / .NET）：60 个 API Controller，覆盖 11 个功能域
- **前端**（TypeScript / React）：4 个子应用（stable/experimental/dashboard/wizard），正在从 Legacy 视图逐步迁移到 React 组件

核心竞争力在于**完全开源、零成本、无追踪、自主可控**，是 Plex/Emby 的自由替代方案。
