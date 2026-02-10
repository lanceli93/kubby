# Jellyfin Agent Skill 速查手册

> 本文档按实际开发场景组织，汇总前 9 篇文档的核心知识点，帮助快速定位设计决策、架构模式和关键代码路径。

---

## 目录

1. [如何设计媒体库系统](#1-如何设计媒体库系统)
2. [如何实现视频转码与流式播放](#2-如何实现视频转码与流式播放)
3. [如何设计插件/扩展系统](#3-如何设计插件扩展系统)
4. [如何设计前后端分离的API层](#4-如何设计前后端分离的api层)
5. [如何组织大型React前端](#5-如何组织大型react前端)
6. [如何设计元数据抓取系统](#6-如何设计元数据抓取系统)
7. [如何设计用户认证系统](#7-如何设计用户认证系统)
8. [如何设计定时任务系统](#8-如何设计定时任务系统)
9. [如何设计数据持久层](#9-如何设计数据持久层)
10. [如何设计事件驱动系统](#10-如何设计事件驱动系统)

---

## 1. 如何设计媒体库系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 库结构存储 | 文件系统（目录 + `.mblink` + `.collection` + `options.xml`） | 库结构与物理文件系统紧密对应，便于管理 |
| 库内容存储 | 数据库（EF Core + `BaseItemEntity` 单表） | 支持高效查询、过滤和排序 |
| 媒体类型区分 | 单表继承（`Type` 字段存储 .NET 类型全名） | 避免大量 JOIN，统一查询逻辑 |
| 层级关系 | `ParentId`（直接父子）+ `AncestorId` 表（祖先链） | 同时支持直接导航和任意深度查询 |
| 命名解析 | 独立的 `Emby.Naming` 库 | 文件名 → 媒体信息的规则解析与核心逻辑解耦 |
| 库扫描 | `ILibraryManager.ValidateMediaLibrary()` + `LibraryMonitor` 文件监控 | 定时全量扫描 + 实时增量监控 |

### 关键架构模式

- **双存储模型**：库*结构*（虚拟文件夹、路径配置）基于文件系统，库*内容*（媒体项、元数据）存储在数据库
- **冗余存储**：`Genres`/`Studios`/`Tags` 同时以管道符分隔字符串存入 `BaseItemEntity` 列（内联快速读取）和 `ItemValue` 多对多表（规范化查询）
- **CollectionFolder 模式**：每个媒体库对应一个 `CollectionFolder` 虚拟文件夹，通过 `.collection` 标记文件区分类型

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 库创建/删除/路径管理的完整 API | 02-feature-detail.md | §1 媒体库管理 |
| `BaseItemEntity` 70+ 字段详解 | 05-data-model.md | §4.2 BaseItemEntity |
| 域模型 `BaseItem` 继承层次 | 05-data-model.md | §5.2 BaseItem 域模型 |
| `LibraryManager` DI 注册 | 03-server-architecture.md | §5.1 媒体库核心 |
| 前端媒体浏览路由 | 01-product-overview.md | §5.2 Stable 应用路由 |

### 核心文件路径

```
后端：
  MediaBrowser.Controller/Library/ILibraryManager.cs          — 核心接口
  Emby.Server.Implementations/Library/LibraryManager.cs       — 实现
  Jellyfin.Api/Controllers/LibraryStructureController.cs      — 库结构 API
  Jellyfin.Api/Controllers/LibraryController.cs               — 库操作 API
  Jellyfin.Api/Controllers/ItemsController.cs                 — 媒体项查询 API
  Jellyfin.Server.Implementations/Item/BaseItemRepository.cs  — 数据访问层
  Emby.Naming/                                                 — 命名规则解析

前端：
  apps/dashboard/features/libraries/                           — Dashboard 库管理
  controllers/home.js                                          — 首页内容浏览
```

---

## 2. 如何实现视频转码与流式播放

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 转码引擎 | FFmpeg（外部进程管理） | 成熟稳定，支持硬件加速 |
| 流式协议 | HLS（主）+ Progressive（辅） | HLS 支持自适应码率，兼容性好 |
| 播放决策 | DeviceProfile + StreamBuilder 三级判断 | DirectPlay → DirectStream → Transcode 按需选择 |
| 分片管理 | 按需转码 + 分片等待机制 | 避免全量转码浪费资源 |
| 会话保活 | Ping 心跳 + 超时清理 | 防止转码进程泄漏 |
| 前端播放器 | hls.js + HTML5 `<video>` | 纯 Web 实现，无需插件 |

### 关键架构模式

- **管线式转码**：请求 → `StreamingHelpers.GetStreamingState()` → `EncodingHelper` 构建 FFmpeg 命令 → `TranscodeManager` 管理进程
- **五阶段播放流程**：用户点击 → 播放协商 (`POST /Items/{id}/PlaybackInfo`) → URL 构建 → 流服务 → 状态上报循环
- **三种播放方式**：
  - DirectPlay — 客户端直接访问文件路径
  - DirectStream — 服务端透传原始流（`/Videos/{id}/stream?Static=true`）
  - Transcode — FFmpeg 实时转码为 HLS（`/Videos/{id}/master.m3u8`）

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 完整播放数据流（五阶段） | 02-feature-detail.md | §2.6 完整播放数据流 |
| 前端 PlaybackManager 编排 | 02-feature-detail.md | §2.2 核心播放器组件 |
| DynamicHlsController 端点 | 02-feature-detail.md | §2.3 DynamicHlsController |
| ITranscodeManager 接口 | 02-feature-detail.md | §2.4 ITranscodeManager |
| 播放器插件架构 | 08-web-patterns.md | §6 播放器插件 |

### 核心文件路径

```
后端：
  Jellyfin.Api/Controllers/VideosController.cs              — Progressive 流
  Jellyfin.Api/Controllers/DynamicHlsController.cs          — HLS 转码
  Jellyfin.Api/Controllers/MediaInfoController.cs           — 播放协商
  Jellyfin.Api/Controllers/PlaystateController.cs           — 播放状态上报
  Jellyfin.Api/Helpers/StreamingHelpers.cs                  — 流辅助
  Jellyfin.Api/Helpers/DynamicHlsHelper.cs                  — HLS 辅助
  MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs   — FFmpeg 命令构建
  MediaBrowser.MediaEncoding/Transcoding/TranscodeManager.cs — 转码进程管理
  MediaBrowser.Model/Dlna/StreamBuilder.cs                  — 播放方式决策

前端：
  components/playback/playbackmanager.js                     — 播放编排核心
  plugins/htmlVideoPlayer/plugin.js                          — HTML5 播放器
  scripts/browserDeviceProfile.js                            — 浏览器能力描述
```

---

## 3. 如何设计插件/扩展系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 隔离机制 | .NET `AssemblyLoadContext`（`isCollectible=true`） | 隔离插件依赖，支持卸载 |
| 元数据管理 | `meta.json` 清单文件 | 声明式元数据，无需加载代码即可获取信息 |
| 多版本共存 | 目录命名 `{Name}_{Version}/`，自动激活最高版本 | 支持升级和回退 |
| DI 集成 | `IPluginServiceRegistrator` 接口 | 插件在容器构建前注册服务 |
| 配置管理 | `BasePlugin<TConfigurationType>` + XML 序列化 | 类型安全的配置读写 |
| 安全校验 | DLL 白名单 + 路径规范化检查 | 防止路径穿越攻击 |

### 关键架构模式

- **完整生命周期**：安装 → 发现 → 加载 → 服务注册 → 实例化 → 运行 → 禁用 → 卸载 → 释放
- **状态机管理**：`PluginStatus` 枚举（Active/Disabled/NotSupported/Malfunctioned/Superseded/Deleted）
- **扩展点矩阵**：插件可注册 `IScheduledTask`、`IEventConsumer<T>`、`IMetadataProvider<T>`、`IImageProvider`、`IConfigurationFactory` 等
- **Fallback 依赖加载**：插件 LoadContext 返回 `null` 时 CLR 回退到默认上下文加载共享依赖

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 插件接口与基类详解 | 07-server-patterns.md | §1.1 插件接口定义 |
| 加载与隔离机制 | 07-server-patterns.md | §1.2 插件发现与加载 |
| 生命周期全流程 | 07-server-patterns.md | §1.3 插件生命周期 |
| 服务注册扩展点 | 07-server-patterns.md | §1.4 扩展点设计 |
| 前端插件管理页 | 01-product-overview.md | §4.7 扩展模块 |

### 核心文件路径

```
后端：
  MediaBrowser.Common/Plugins/IPlugin.cs                     — 插件顶层契约
  MediaBrowser.Common/Plugins/BasePlugin.cs                  — 通用抽象基类
  MediaBrowser.Common/Plugins/BasePluginOfT.cs               — 带配置的插件基类
  MediaBrowser.Common/Plugins/PluginManifest.cs              — 清单模型
  MediaBrowser.Controller/Plugins/IPluginServiceRegistrator.cs — DI 扩展接口
  Emby.Server.Implementations/Plugins/PluginManager.cs       — 插件管理器
  Emby.Server.Implementations/Plugins/PluginLoadContext.cs   — 程序集隔离加载

前端：
  apps/dashboard/features/plugins/                            — 插件管理 UI
  Jellyfin.Api/Controllers/PluginsController.cs              — 插件 REST API
  Jellyfin.Api/Controllers/PackageController.cs              — 包管理 API
```

---

## 4. 如何设计前后端分离的API层

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| API 框架 | ASP.NET Core Controller | 成熟框架，完善的中间件管道 |
| 认证方案 | 自定义不透明 Token（非 JWT） | 支持即时撤销，数据库集中管理 |
| 版本策略 | 无 URL 版本号，`[Obsolete]` 渐进废弃 | 简化 URL，社区项目够用 |
| 序列化 | System.Text.Json，支持 CamelCase/PascalCase 双格式 | 性能优先，兼容多客户端 |
| 实时通信 | WebSocket + Start/Stop/Data 三消息模式 | 会话/任务/日志实时推送 |
| 前端 API 客户端 | 双客户端（legacy `jellyfin-apiclient` + `@jellyfin/sdk`）+ `compat.ts` 桥接 | 渐进式迁移 |

### 关键架构模式

- **17 种授权策略**：ASP.NET Core Policy-based 授权，每个策略由 `Requirement + Handler` 对组成
- **Token 解析优先级链**：`Authorization` 头 → `X-Emby-Authorization` → `X-Emby-Token` → `X-MediaBrowser-Token` → `ApiKey` 查询参数
- **WebSocket Listener 框架**：`BasePeriodicWebSocketListener` 基于 Channel（生产者-消费者）实现订阅式数据推送
- **ExceptionMiddleware 异常映射**：`AuthenticationException → 401`、`SecurityException → 403`、`ResourceNotFoundException → 404`
- **自定义 ModelBinder**：`CommaDelimitedCollectionModelBinder`、`PipeDelimitedCollectionModelBinder` 处理复杂集合参数

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 认证全链路图 | 06-api-design.md | §3.4 认证完整链路图 |
| 授权策略体系 | 06-api-design.md | §3.3 授权策略体系 |
| WebSocket 架构 | 06-api-design.md | §4 WebSocket 通信 |
| 中间件管道顺序 | 03-server-architecture.md | §6.1 管道顺序 |
| 前端 TanStack Query 封装 | 06-api-design.md | §5.4 TanStack Query 封装 |
| 60 个 Controller 概览 | 01-product-overview.md | §6 后端 Controller 概览 |

### 核心文件路径

```
后端：
  Jellyfin.Api/BaseJellyfinApiController.cs                    — Controller 基类
  Jellyfin.Api/Auth/CustomAuthenticationHandler.cs             — 认证处理器
  Jellyfin.Server.Implementations/Security/AuthorizationContext.cs — Token 解析
  Jellyfin.Api/Middleware/ExceptionMiddleware.cs                — 异常处理中间件
  Jellyfin.Api/Middleware/IpBasedAccessValidationMiddleware.cs — IP 访问控制
  Emby.Server.Implementations/HttpServer/WebSocketManager.cs   — WebSocket 管理
  MediaBrowser.Controller/Net/BasePeriodicWebSocketListener.cs — 订阅式推送基类
  MediaBrowser.Common/Api/Policies.cs                          — 策略名称常量

前端：
  hooks/useApi.tsx                                              — API Context Provider
  utils/jellyfin-apiclient/compat.ts                           — 新旧 SDK 桥接
  utils/query/queryClient.ts                                   — QueryClient 配置
```

---

## 5. 如何组织大型React前端

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 多应用架构 | 4 个子应用（stable/experimental/dashboard/wizard） | 按权限和场景隔离 |
| 路由 | Hash Router（`#/`） + React Router v6 Data Router | 确保各种服务器环境兼容 |
| 状态管理 | TanStack Query + React Context（无 Redux） | 服务端状态为主，避免额外复杂度 |
| 代码分割 | React Router `lazy` + Webpack `import()` + npm 包独立 chunk | 精细粒度缓存 |
| Legacy 共存 | ViewManagerPage 桥接 + 双容器渲染 + `renderComponent` | 渐进式迁移 |
| 主题系统 | MUI Theme + SCSS 双轨 | 新组件用 MUI，旧组件用 SCSS |
| i18n | 自研 globalize 模块 | 轻量级，支持 99 种语言 |

### 关键架构模式

- **渐进式迁移策略**：
  1. `renderComponent()` 允许在 Legacy 代码中挂载 React 组件
  2. `RootContext` 提供完整 Provider 栈
  3. `queryOptions` 工厂函数让 Legacy JS 可访问 TanStack Query 缓存
  4. 事件系统 (`utils/events`) 作为跨框架通信通道
- **双容器渲染**：`AppBody` 同时渲染 Legacy 容器和 React 容器，通过 `viewManager.hideView()` 切换
- **Feature 目录模式**：Dashboard 按 `features/{domain}/api/` + `features/{domain}/components/` 组织
- **Provider 链**：`QueryClientProvider → ApiProvider → UserSettingsProvider → WebConfigProvider → Router`

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 多应用架构详解 | 04-web-architecture.md | §3 多应用架构 |
| 路由类型系统 | 04-web-architecture.md | §4 路由架构 |
| 状态管理方案 | 04-web-architecture.md | §5 状态管理方案 |
| 构建与代码分割 | 04-web-architecture.md | §7 构建与开发配置 |
| Legacy 迁移策略 | 08-web-patterns.md | §3 Legacy → React 迁移 |
| TanStack Query 封装模式 | 08-web-patterns.md | §1 TanStack Query 数据层 |
| 自定义 Hooks 体系 | 08-web-patterns.md | §2 自定义 Hooks 体系 |

### 核心文件路径

```
src/
  RootApp.tsx                                  — 应用根组件（Provider 层）
  RootAppRouter.tsx                            — 路由根组件
  apps/stable/                                 — 稳定版子应用
  apps/experimental/                           — 实验版子应用
  apps/dashboard/                              — 管理后台子应用
  apps/dashboard/features/                     — Feature 目录模式
  components/viewManager/ViewManagerPage.tsx   — Legacy 桥接组件
  components/ConnectionRequired.tsx            — 路由守卫
  hooks/useApi.tsx                             — API Context
  utils/reactUtils.tsx                         — renderComponent 桥接工具
  themes/index.ts                              — MUI 主题定义
  lib/globalize/index.js                       — i18n 引擎
```

---

## 6. 如何设计元数据抓取系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 提供器架构 | 插件式 Provider（`ILocalMetadataProvider` + `IRemoteMetadataProvider` + `IRemoteImageProvider`） | 可扩展，支持第三方源 |
| 协调模式 | `ProviderManager` 中央协调器 + `MetadataService` 管线 | 解耦调度与执行 |
| 刷新策略 | 三种模式 — 扫描新文件 / 填充缺失 / 全量替换 | 不同场景灵活选择 |
| 异步处理 | 优先级队列 (`QueueRefresh`)，后台异步处理 | 避免阻塞 API 请求 |
| 提供器优先级 | 按库配置排序，支持字段锁定 | 管理员可控制数据来源 |
| 类型分派 | 26 个 `MetadataService` 子类，每种媒体类型一个 | 类型特定的合并逻辑 |

### 关键架构模式

- **五层架构**：前端组件 → REST Controller（薄层）→ `ProviderManager`（中央协调器）→ `MetadataService`（管线）→ Provider（插件）
- **MetadataService 管线**（7 步）：图片验证 → 预处理 → 本地提供器 → 远程提供器 → 合并结果 → 图片下载 → 持久化 → 级联刷新子项
- **远程搜索/识别流程**：搜索多个 `IRemoteSearchProvider` → 用户选择结果 → 覆写 ProviderIds → 触发全量刷新

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 手动编辑/识别/刷新三大流程 | 02-feature-detail.md | §4.6 关键数据流 |
| IProviderManager 接口 | 02-feature-detail.md | §4.4 IProviderManager |
| MetadataService 子类列表 | 02-feature-detail.md | §4.5 实现文件 |
| ProviderManager DI 注册 | 03-server-architecture.md | §5.1 元数据与提供者 |

### 核心文件路径

```
后端：
  MediaBrowser.Controller/Providers/IProviderManager.cs        — 中央协调器接口
  MediaBrowser.Providers/Manager/ProviderManager.cs            — 协调器实现
  MediaBrowser.Providers/Manager/MetadataService.cs            — 管线抽象基类
  MediaBrowser.Providers/Movies/MovieMetadataService.cs        — 电影元数据服务
  MediaBrowser.Providers/TV/SeriesMetadataService.cs           — 剧集元数据服务
  Jellyfin.Api/Controllers/ItemLookupController.cs             — 远程搜索 API
  Jellyfin.Api/Controllers/ItemRefreshController.cs            — 刷新 API
  Jellyfin.Api/Controllers/ItemUpdateController.cs             — 手动编辑 API
  Jellyfin.Api/Controllers/RemoteImageController.cs            — 远程图片 API

前端：
  components/metadataEditor/metadataEditor.js                  — 编辑表单
  components/itemidentifier/itemidentifier.js                  — 识别对话框
  components/refreshdialog/refreshdialog.js                    — 刷新对话框
```

---

## 7. 如何设计用户认证系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| Token 类型 | 不透明随机 Token（非 JWT） | 支持即时撤销 |
| Token 存储 | 数据库 `Device` 表（Token = Device 记录） | 登出即删除记录 |
| 认证提供器 | 插件式链（`IAuthenticationProvider`） | 可扩展 LDAP 等第三方认证 |
| 免密登录 | QuickConnect（6 位数字 Code + 32 字节 Secret） | 适配 TV 等输入不便的设备 |
| 暴力防护 | 失败计数 + 阈值锁定 | `InvalidLoginAttemptCount` 达阈值自动禁用 |
| 前端路由守卫 | `ConnectionRequired` 组件，4 级访问控制 | public/user/admin/wizard |

### 关键架构模式

- **认证提供器链**：`UserManager.AuthenticateLocalUser()` 遍历所有 `IAuthenticationProvider`，内置 `DefaultAuthenticationProvider` 检查密码哈希
- **QuickConnect 三方交互**：设备 A 发起请求 → 显示 Code → 设备 B 授权 → 设备 A 轮询获取 Token
- **Claims 体系**：`CustomAuthenticationHandler` 将认证信息映射为 ASP.NET Core Claims（UserId、DeviceId、Role、Token、IsApiKey）

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 用户名密码/QuickConnect/路由守卫流程 | 02-feature-detail.md | §3.6 关键认证流程 |
| IUserManager/ISessionManager 接口 | 02-feature-detail.md | §3.4 Service 接口 |
| Claims 映射详解 | 06-api-design.md | §3.2.3 CustomAuthenticationHandler |
| Token 解析优先级 | 06-api-design.md | §3.2.1 Token 解析流程 |
| 前端认证流程 | 06-api-design.md | §5.5 前端认证流程 |

### 核心文件路径

```
后端：
  Jellyfin.Api/Controllers/UserController.cs                   — 用户/认证 API
  Jellyfin.Api/Controllers/QuickConnectController.cs           — QuickConnect API
  Jellyfin.Api/Auth/CustomAuthenticationHandler.cs             — 认证处理器
  Jellyfin.Server.Implementations/Users/UserManager.cs         — 用户管理实现
  Emby.Server.Implementations/Session/SessionManager.cs        — 会话管理
  Emby.Server.Implementations/QuickConnect/QuickConnectManager.cs — QuickConnect 实现
  Jellyfin.Server.Implementations/Security/AuthorizationContext.cs — Token 验证

前端：
  controllers/session/login/index.js                            — 登录页控制器
  components/ConnectionRequired.tsx                             — 路由守卫
```

---

## 8. 如何设计定时任务系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 任务接口 | `IScheduledTask`（Name/Key/Description/Category/Execute/DefaultTriggers） | 简洁的契约，自描述 |
| 调度器 | `TaskManager` + `ConcurrentQueue` 排队 | 防止并发执行 + 排队机制 |
| 执行引擎 | `ScheduledTaskWorker`（包装每个任务实例） | 独立管理状态、触发器、执行历史 |
| 触发器类型 | Daily / Weekly / Interval / Startup 四种 | 覆盖常见调度场景 |
| 进度报告 | `IProgress<double>` 回调 + WebSocket 实时推送 | REST API 和 WebSocket 双通道获取进度 |
| 配置持久化 | `{ConfigDir}/ScheduledTasks/{md5-id}.js` JSON 文件 | 触发器配置持久化 |

### 关键架构模式

- **任务/触发器/Worker 三层分离**：
  - `IScheduledTask` — 定义"做什么"
  - `ITaskTrigger` — 定义"什么时候做"
  - `ScheduledTaskWorker` — 执行引擎，管理状态和生命周期
- **排队去重**：`QueueScheduledTask` 在 `lock` 内原子性检查状态（Idle → 立即执行，Running → 排队），完成后去重执行
- **优雅关闭**：Worker Dispose 时取消 Token + 等待 2 秒 + 记录 Aborted 状态

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| IScheduledTask 接口详解 | 07-server-patterns.md | §2.1 任务定义接口 |
| 四种触发器实现 | 07-server-patterns.md | §2.2 触发器类型 |
| TaskManager 调度逻辑 | 07-server-patterns.md | §2.3 TaskManager |
| Worker 执行管线 | 07-server-patterns.md | §2.4 ScheduledTaskWorker |
| 20+ 内置任务一览 | 07-server-patterns.md | §2.6 内置任务 |
| 前端任务管理 UI | 02-feature-detail.md | §7 定时任务 |

### 核心文件路径

```
后端：
  MediaBrowser.Model/Tasks/IScheduledTask.cs                    — 任务契约
  MediaBrowser.Model/Tasks/ITaskManager.cs                      — 管理器接口
  MediaBrowser.Model/Tasks/ITaskTrigger.cs                      — 触发器契约
  Emby.Server.Implementations/ScheduledTasks/TaskManager.cs     — 调度实现
  Emby.Server.Implementations/ScheduledTasks/ScheduledTaskWorker.cs — 执行引擎
  Emby.Server.Implementations/ScheduledTasks/Triggers/          — 触发器实现
  Emby.Server.Implementations/ScheduledTasks/Tasks/             — 内置任务

前端：
  apps/dashboard/features/tasks/                                — 任务管理 UI
  apps/dashboard/features/tasks/hooks/useLiveTasks.ts          — WebSocket 实时状态
```

---

## 9. 如何设计数据持久层

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| ORM | Entity Framework Core (Code-First) | .NET 生态标准 ORM |
| 默认数据库 | SQLite | 零配置、嵌入式、适合自托管场景 |
| 数据库抽象 | `IJellyfinDatabaseProvider` 接口 | 可插拔多数据库引擎 |
| 模型映射 | 手动 `Map()` 方法（无 AutoMapper） | 最大控制力 |
| 并发控制 | `IHasConcurrencyToken`（RowVersion 自增） | 乐观并发 |
| 迁移策略 | EF Core Migrations + 自定义 Code Migrations 双重体系 | Schema DDL + 数据级迁移分离 |

### 关键架构模式

- **单表继承**：所有媒体类型存入 `BaseItemEntity`，`Type` 字段区分类型，`Data` 列 JSON 存储子类特有属性
- **双重序列化**：DB 列存储可索引核心字段 + `Data` 列 JSON 存储完整对象，读取时合并
- **三阶段迁移**：`PreInitialisation`（启动前）→ `CoreInitialisation`（含 EF Core 迁移）→ `AppInitialisation`（应用级数据修复）
- **迁移安全**：`[JellyfinMigrationBackup]` 特性声明备份需求，框架自动执行备份和失败回滚
- **索引策略**：`BaseItemEntity` 上有 15+ 复合索引，覆盖各种查询场景（系列查询、最新项目、继续播放等）

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| 核心实体 ER 关系图 | 05-data-model.md | §3 实体关系图 |
| BaseItemEntity 70+ 字段 | 05-data-model.md | §4.2 BaseItemEntity |
| 域模型 vs DB 实体映射 | 05-data-model.md | §5 域模型 vs DB 实体 |
| EF Core 配置与索引策略 | 05-data-model.md | §6 EF Core 配置模式 |
| 双重迁移系统 | 05-data-model.md | §7 迁移策略 |
| 迁移框架设计 | 07-server-patterns.md | §6 迁移框架 |

### 核心文件路径

```
  Jellyfin.Database.Implementations/JellyfinDbContext.cs           — DbContext
  Jellyfin.Database.Implementations/Entities/                      — 所有 DB 实体
  Jellyfin.Database.Implementations/ModelConfiguration/            — Fluent API 配置
  Jellyfin.Database.Implementations/IJellyfinDatabaseProvider.cs   — 数据库 Provider 接口
  Jellyfin.Database.Providers.Sqlite/SqliteDatabaseProvider.cs     — SQLite 实现
  Jellyfin.Database.Providers.Sqlite/Migrations/                   — EF Core 迁移
  Jellyfin.Server/Migrations/                                      — 应用级迁移
  Jellyfin.Server.Implementations/Item/BaseItemRepository.cs       — 核心映射逻辑
  MediaBrowser.Controller/Entities/                                — 域模型
```

---

## 10. 如何设计事件驱动系统

### 设计决策要点

| 决策 | Jellyfin 的选择 | 理由 |
|------|----------------|------|
| 发布接口 | `IEventManager.Publish<T>()` / `PublishAsync<T>()` | 纯发布，无订阅 API |
| 消费者发现 | DI 容器自动解析 `IEventConsumer<T>` | 添加新消费者只需实现接口 + 注册 DI |
| 执行模式 | 顺序执行，错误隔离 | 单个消费者失败不影响其他 |
| 消费者模式 | Logger（写入活动日志）+ Notifier（WebSocket 推送） | 持久化和实时通知分离 |
| 遗留系统 | .NET `EventHandler` + `EventHelper.QueueEventIfNotNull` | 迁移中，部分事件同时触发两套系统 |

### 关键架构模式

- **DI 作为订阅注册表**：`EventManager` 每次发布事件时创建新 DI 作用域，解析所有 `IEventConsumer<T>`
- **Logger + Notifier 双模式**：同一事件可同时有 Logger（`IActivityManager.CreateAsync()`）和 Notifier（`ISessionManager.SendMessageToAdminSessions()`）两种消费者
- **完整数据流**：生产者 → `IEventManager` → DI 解析消费者 → Logger 写 DB + 触发 `ActivityLogWebSocketListener` → Notifier 直接推送 WebSocket
- **WebSocket 订阅推送**：`BasePeriodicWebSocketListener` 实现 Start/Stop 订阅模式，基于 Channel 的生产者-消费者

### 推荐参考文档章节

| 主题 | 文档 | 章节 |
|------|------|------|
| IEventManager/IEventConsumer 详解 | 07-server-patterns.md | §3.1 现代事件系统 |
| 事件参数体系 | 07-server-patterns.md | §3.2 事件参数体系 |
| Logger/Notifier 消费者完整注册表 | 07-server-patterns.md | §3.3 消费者双模式 |
| WebSocket 实时推送完整数据流 | 07-server-patterns.md | §3.4 WebSocket 推送 |
| WebSocket Listener 基类 | 06-api-design.md | §4.4 BasePeriodicWebSocketListener |
| 事件消费者 DI 注册 | 03-server-architecture.md | §5.4 事件消费者注册 |

### 核心文件路径

```
后端：
  MediaBrowser.Controller/Events/IEventManager.cs               — 发布接口
  MediaBrowser.Controller/Events/IEventConsumer.cs              — 消费者接口
  Jellyfin.Server.Implementations/Events/EventManager.cs        — 发布实现
  Jellyfin.Server.Implementations/Events/Consumers/             — 所有消费者
  Jellyfin.Server.Implementations/Events/EventingServiceCollectionExtensions.cs — DI 注册
  MediaBrowser.Controller/Net/BasePeriodicWebSocketListener.cs  — 订阅推送基类
  Jellyfin.Data/Events/GenericEventArgs.cs                      — 通用事件参数基类

前端：
  apps/dashboard/features/tasks/hooks/useLiveTasks.ts           — WebSocket + Query 混合
```

---

## 附录：跨场景模式速查

### 设计模式频率表

| 模式 | 出现场景 | 参考 |
|------|---------|------|
| **接口驱动 + DI** | 所有核心服务 | 03-server-architecture.md §7 |
| **插件式提供器** | 认证、元数据、图片、字幕、歌词 | 07-server-patterns.md §1.4 |
| **管线/Pipeline** | 元数据刷新、转码、中间件 | 02-feature-detail.md §4, 03-server-architecture.md §6 |
| **状态机** | SyncPlay（4 状态）、PluginStatus（6 状态） | 02-feature-detail.md §5, 07-server-patterns.md §1 |
| **发布-订阅** | 事件系统、WebSocket 推送 | 07-server-patterns.md §3 |
| **双存储/冗余** | 媒体库（FS+DB）、BaseItem（列+JSON） | 05-data-model.md §5.5 |
| **渐进式迁移** | Legacy→React、遗留事件→IEventManager | 08-web-patterns.md §3 |
| **工厂模式** | 配置工厂、触发器工厂、播放器工厂 | 07-server-patterns.md §4, 08-web-patterns.md §6 |
| **组合根** | ApplicationHost 集中注册 60+ 服务 | 03-server-architecture.md §5 |
