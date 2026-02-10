# 03 - Jellyfin Server 架构分析

## 1. 项目结构总览

Jellyfin 解决方案包含约 25 个项目（不含测试），按职责可分为以下几类：

| 项目 | 职责 |
|------|------|
| **Jellyfin.Server** | 可执行入口，配置 Kestrel Web 主机、启动流程编排 |
| **Emby.Server.Implementations** | 核心服务实现聚合层（DI 组合根），注册绝大多数业务服务 |
| **Jellyfin.Api** | REST API 控制器、中间件、认证授权处理器 |
| **MediaBrowser.Controller** | 核心业务接口抽象层（Manager/Service 接口定义） |
| **MediaBrowser.Model** | DTO/枚举/配置模型，几乎不含业务逻辑 |
| **MediaBrowser.Common** | 跨模块通用工具（事件、插件、更新、网络工具） |
| **Jellyfin.Data** | EF Core 数据实体定义 |
| **Jellyfin.Database.Implementations** | EF Core DbContext、迁移、数据库提供者接口 |
| **Jellyfin.Database.Providers.Sqlite** | SQLite 数据库提供者实现 |
| **Jellyfin.Server.Implementations** | 用户管理、设备管理、活动日志、事件消费者等服务实现 |
| **Jellyfin.Networking** | 网络管理器（IP 绑定、代理、UDP 发现） |
| **Jellyfin.Drawing** | 图像处理抽象 |
| **Jellyfin.Drawing.Skia** | 基于 SkiaSharp 的图像编码器实现 |
| **Jellyfin.LiveTv** | 直播电视/DVR 功能（频道、录制、调谐器、EPG） |
| **MediaBrowser.Providers** | 元数据提供者（TMDb、MusicBrainz、OMDB 等） |
| **MediaBrowser.MediaEncoding** | FFmpeg 媒体编码/转码引擎 |
| **MediaBrowser.LocalMetadata** | 本地 NFO/XML 元数据读写 |
| **MediaBrowser.XbmcMetadata** | Kodi/XBMC NFO 格式元数据 |
| **Jellyfin.MediaEncoding.Hls** | HLS 动态播放列表生成 |
| **Jellyfin.MediaEncoding.Keyframes** | 关键帧提取（Matroska/FFprobe） |
| **Jellyfin.Extensions** | 通用扩展方法（JSON、字符串等） |
| **Emby.Naming** | 媒体文件命名规则解析 |
| **Emby.Photos** | 照片元数据提供者 |

---

## 2. 分层架构图

```
┌─────────────────────────────────────────────────────────┐
│                   Jellyfin.Server                        │
│              (可执行入口 / Kestrel 主机)                   │
│    Program.cs → CoreAppHost → Startup → 中间件管道        │
└────────────────┬────────────────────────────────────────┘
                 │ 依赖
┌────────────────▼────────────────────────────────────────┐
│            Emby.Server.Implementations                   │
│           (DI 组合根 / ApplicationHost)                   │
│    注册所有核心服务、发现插件、组装各模块                      │
└──┬──────┬──────┬───────┬───────┬───────┬───────┬────────┘
   │      │      │       │       │       │       │
   ▼      ▼      ▼       ▼       ▼       ▼       ▼
┌──────┐┌─────┐┌──────┐┌──────┐┌──────┐┌──────┐┌─────────┐
│Jelly-││Jelly-││Media-││Media-││Media-││Emby. ││Jellyfin.│
│fin.  ││fin. ││Brows-││Brows-││Brows-││Photos││Server.  │
│Api   ││Live ││er.   ││er.   ││er.   ││      ││Implemen-│
│      ││Tv   ││Provi-││Media-││Local/ ││      ││tations  │
│      ││     ││ders  ││Encod-││Xbmc  ││      ││         │
│      ││     ││      ││ing   ││Meta  ││      ││         │
└──┬───┘└──┬──┘└──┬───┘└──┬───┘└──┬───┘└──┬───┘└──┬──────┘
   │       │      │       │       │       │       │
   ▼       ▼      ▼       ▼       ▼       ▼       ▼
┌─────────────────────────────────────────────────────────┐
│              MediaBrowser.Controller                      │
│         (核心接口抽象层 / Manager 接口)                     │
│   ILibraryManager, ISessionManager, IMediaEncoder ...     │
└──────────────────┬──────────────────────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
┌─────────────────┐ ┌──────────────────┐
│ MediaBrowser.    │ │  Emby.Naming     │
│ Common           │ │ (命名解析)        │
│ (通用工具/插件)   │ └──────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ MediaBrowser.    │
│ Model            │
│ (DTO/枚举/配置)  │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌──────────────┐
│Jellyfin│ │ Jellyfin.    │
│.Data   │ │ Extensions   │
│(实体)  │ │ (工具方法)    │
└───┬────┘ └──────────────┘
    │
    ▼
┌─────────────────────────┐
│ Jellyfin.Database.      │
│ Implementations         │
│ (DbContext / 迁移)       │
└─────────────────────────┘
```

---

## 3. 项目依赖关系

### 依赖层级表

| 层级 | 项目 | 依赖 |
|------|------|------|
| **L0 (叶子)** | `Jellyfin.Database.Implementations` | 无项目引用（仅 NuGet） |
| **L0** | `Jellyfin.Extensions` | 无项目引用 |
| **L0** | `Jellyfin.MediaEncoding.Keyframes` | 无项目引用 |
| **L1** | `Jellyfin.Data` | → Database.Implementations |
| **L2** | `MediaBrowser.Model` | → Jellyfin.Data, Jellyfin.Extensions |
| **L3** | `MediaBrowser.Common` | → MediaBrowser.Model |
| **L3** | `Emby.Naming` | 无项目引用（独立） |
| **L4** | `MediaBrowser.Controller` | → Model, Common, Emby.Naming, MediaEncoding.Keyframes |
| **L5** | `Jellyfin.Api` | → Controller, MediaEncoding, MediaEncoding.Hls, Networking |
| **L5** | `Jellyfin.Networking` | → Common, Controller |
| **L5** | `Jellyfin.Drawing` | → Model, Controller, Common |
| **L5** | `Jellyfin.LiveTv` | → Model, Controller, Common |
| **L5** | `MediaBrowser.Providers` | → Controller, Model |
| **L5** | `MediaBrowser.MediaEncoding` | → Common, Controller, Model |
| **L5** | `MediaBrowser.LocalMetadata` | → Controller, Model |
| **L5** | `MediaBrowser.XbmcMetadata` | → Model, Controller |
| **L5** | `Jellyfin.Server.Implementations` | → Data, Controller, Model, Database.Implementations, Database.Providers.Sqlite |
| **L6** | `Emby.Server.Implementations` | → 12 个项目（几乎所有功能模块） |
| **L7** | `Jellyfin.Server` | → Emby.Server.Implementations, Server.Implementations, Drawing, Drawing.Skia, LiveTv, MediaEncoding.Hls, Database.Implementations |

### 核心依赖三角

大多数功能模块都遵循统一的依赖模式：

```
功能模块 → MediaBrowser.Controller (接口)
         → MediaBrowser.Model     (DTO)
         → MediaBrowser.Common    (工具)
```

---

## 4. 启动序列

从 `Main()` 到服务完全就绪的完整启动流程：

### 4.1 阶段一：进程初始化

```
Program.Main(args)
  │
  ├─ 1. 解析命令行参数 (CommandLine.Parser → StartupOptions)
  │
  ├─ 2. StartApp(options)
  │     ├─ 创建 ServerApplicationPaths（数据目录、配置目录、日志目录等）
  │     ├─ 设置环境变量 (JELLYFIN_LOG_DIR, VAAPI 相关)
  │     ├─ 初始化日志配置文件 (logging.default.json / logging.json)
  │     ├─ 构建 IConfiguration（命令行 + 环境变量 + JSON 配置）
  │     ├─ 初始化 Serilog 日志框架
  │     ├─ 启动 SetupServer（初始配置向导 Web 服务器）
  │     ├─ 执行存储容量检查
  │     ├─ PerformStaticInitialization()（全局静态初始化）
  │     └─ ApplyStartupMigrationAsync()（Pre-Initialisation 阶段数据库迁移）
  │
  └─ 3. 进入 do-while 循环（支持热重启）
        └─ StartServer(appPaths, options, startupConfig)
```

### 4.2 阶段二：Host 构建与 DI 注册

```
StartServer()
  │
  ├─ 4. 创建 CoreAppHost（继承自 ApplicationHost）
  │     ├─ 构造 ServerConfigurationManager
  │     ├─ 构造 PluginManager
  │     └─ 设置应用版本、UserAgent 等
  │
  ├─ 5. Host.CreateDefaultBuilder()
  │     ├─ .UseConsoleLifetime()
  │     ├─ .ConfigureServices(appHost.Init(services))  ← 核心 DI 注册
  │     │     ├─ DiscoverTypes() — 扫描所有程序集中的具体类型
  │     │     ├─ ConfigurationManager.AddParts() — 加载配置工厂
  │     │     ├─ 创建 NetworkManager
  │     │     ├─ 配置 HTTP/HTTPS 端口和证书
  │     │     ├─ CoreAppHost.RegisterServices() — 注册图像编码器、事件、用户管理等
  │     │     ├─ ApplicationHost.RegisterServices() — 注册 60+ 核心服务
  │     │     └─ PluginManager.RegisterServices() — 注册插件服务
  │     │
  │     ├─ .ConfigureWebHostDefaults()
  │     │     ├─ ConfigureWebHostBuilder() — 配置 Kestrel 监听地址和端口
  │     │     └─ UseStartup<Startup>() — 注册 Startup 类
  │     │           ├─ Startup.ConfigureServices() — 注册 API/Auth/Swagger/HttpClient/HealthCheck
  │     │           └─ Startup.Configure() — 配置中间件管道
  │     │
  │     ├─ .UseSerilog()
  │     └─ .Build()
```

### 4.3 阶段三：服务初始化与启动

```
  │
  ├─ 6. appHost.ServiceProvider = _jellyfinHost.Services
  │     └─ PrepareDatabaseProvider() — 设置 DbContextFactory
  │
  ├─ 7. JellyfinMigrationService
  │     ├─ PrepareSystemForMigration()
  │     └─ MigrateStepAsync(CoreInitialisation)
  │
  ├─ 8. appHost.InitializeServices(startupConfig)
  │     ├─ LocalizationManager.LoadAll() — 加载所有本地化资源
  │     ├─ SetStaticProperties() — 设置 BaseItem 等静态属性（历史遗留）
  │     └─ FindParts() — 发现并注册插件组件
  │           ├─ PluginManager.CreatePlugins()
  │           ├─ LibraryManager.AddParts() — 注入解析器、比较器、后扫描任务
  │           ├─ ProviderManager.AddParts() — 注入图片/元数据提供者和保存器
  │           └─ MediaSourceManager.AddParts() — 注入媒体源提供者
  │
  ├─ 9. MigrateStepAsync(AppInitialisation)
  │     └─ CleanupSystemAfterMigration()
  │
  ├─ 10. 停止 SetupServer（配置向导服务）
  │
  ├─ 11. _jellyfinHost.StartAsync() — 启动 Kestrel 开始监听
  │
  ├─ 12. appHost.RunStartupTasksAsync()
  │      ├─ 注册所有 IScheduledTask 到 TaskManager
  │      ├─ 绑定配置更新事件
  │      ├─ 验证 FFmpeg 路径
  │      └─ CoreStartupHasCompleted = true
  │
  └─ 13. "Startup complete" — 等待关闭信号
         └─ _jellyfinHost.WaitForShutdownAsync()
```

### 4.4 阶段四：关闭流程

```
关闭/重启
  ├─ 执行数据库查询优化器 (RunShutdownTask)
  ├─ 释放 CoreAppHost
  ├─ 释放 IHost
  └─ 如果 ShouldRestart == true → 重新进入 StartServer 循环
```

---

## 5. DI 注册全景

### 5.1 ApplicationHost.RegisterServices() — 基础设施与核心业务

在 `Emby.Server.Implementations/ApplicationHost.cs:469-583` 中注册：

#### 配置与应用

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IServerConfigurationManager` | `ServerConfigurationManager` | Singleton |
| `IConfigurationManager` | `ServerConfigurationManager` | Singleton |
| `IApplicationHost` | `ApplicationHost` (this) | Singleton |
| `IServerApplicationHost` | `ApplicationHost` (this) | Singleton |
| `IPluginManager` | `PluginManager` | Singleton |
| `IApplicationPaths` | `ServerApplicationPaths` | Singleton |
| `IStartupOptions` | `StartupOptions` | Singleton |

#### 文件系统与 IO

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IFileSystem` | `ManagedFileSystem` | Singleton |
| `IShortcutHandler` | `MbLinkShortcutHandler` | Singleton |
| `IDirectoryService` | `DirectoryService` | Singleton |

#### 媒体库核心

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `ILibraryManager` | `LibraryManager` | Singleton |
| `ILibraryMonitor` | `LibraryMonitor` | Singleton |
| `ISearchEngine` | `SearchEngine` | Singleton |
| `IUserDataManager` | `UserDataManager` | Singleton |
| `IMusicManager` | `MusicManager` | Singleton |
| `ITVSeriesManager` | `TVSeriesManager` | Singleton |
| `ICollectionManager` | `CollectionManager` | Singleton |
| `IPlaylistManager` | `PlaylistManager` | Singleton |
| `IUserViewManager` | `UserViewManager` | Singleton |

#### 数据持久化

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IItemRepository` | `BaseItemRepository` | Singleton |
| `IPeopleRepository` | `PeopleRepository` | Singleton |
| `IChapterRepository` | `ChapterRepository` | Singleton |
| `IMediaAttachmentRepository` | `MediaAttachmentRepository` | Singleton |
| `IMediaStreamRepository` | `MediaStreamRepository` | Singleton |
| `IKeyframeRepository` | `KeyframeRepository` | Singleton |

#### 媒体处理

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IMediaEncoder` | `MediaEncoder` | Singleton |
| `IMediaSourceManager` | `MediaSourceManager` | Singleton |
| `ISubtitleManager` | `SubtitleManager` | Singleton |
| `ILyricManager` | `LyricManager` | Singleton |
| `ISubtitleParser` | `SubtitleEditParser` | Singleton |
| `ISubtitleEncoder` | `SubtitleEncoder` | Singleton |
| `ITranscodeManager` | `TranscodeManager` | Singleton |
| `IImageProcessor` | `ImageProcessor` | Singleton |
| `IBlurayExaminer` | `BdInfoExaminer` | Singleton |
| `IAttachmentExtractor` | `AttachmentExtractor` | Singleton |

#### 会话与通信

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `ISessionManager` | `SessionManager` | Singleton |
| `IWebSocketManager` | `WebSocketManager` | Singleton |
| `IDtoService` | `DtoService` | Singleton |

#### 元数据与提供者

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IProviderManager` | `ProviderManager` | Singleton |
| `TmdbClientManager` | `TmdbClientManager` | Singleton |
| `ILocalizationManager` | `LocalizationManager` | Singleton |

#### 基础设施

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `INetworkManager` | `NetworkManager` | Singleton |
| `ITaskManager` | `TaskManager` | Singleton |
| `ICryptoProvider` | `CryptographyProvider` | Singleton |
| `IInstallationManager` | `InstallationManager` | Singleton |
| `ISocketFactory` | `SocketFactory` | Singleton |
| `IBackupService` | `BackupService` | Singleton |
| `ISyncPlayManager` | `SyncPlayManager` | Singleton |
| `IQuickConnect` | `QuickConnectManager` | Singleton |
| `IAuthService` | `AuthService` | Singleton |
| `NamingOptions` | `NamingOptions` | Singleton |
| `ISystemManager` | `SystemManager` | Scoped |

### 5.2 CoreAppHost.RegisterServices() — 服务器特定服务

在 `Jellyfin.Server/CoreAppHost.cs:63-111` 中注册：

| 服务接口 | 实现类 | 生命周期 |
|----------|--------|----------|
| `IImageEncoder` | `SkiaEncoder` 或 `NullImageEncoder` | Singleton |
| `IBaseItemManager` | `BaseItemManager` | Singleton |
| `IEventManager` | `EventManager` | Singleton |
| `IActivityManager` | `ActivityManager` | Singleton |
| `IUserManager` | `UserManager` | Singleton |
| `IAuthenticationProvider` | `DefaultAuthenticationProvider` | Singleton |
| `IAuthenticationProvider` | `InvalidAuthProvider` | Singleton |
| `IPasswordResetProvider` | `DefaultPasswordResetProvider` | Singleton |
| `IDisplayPreferencesManager` | `DisplayPreferencesManager` | Singleton |
| `IDeviceManager` | `DeviceManager` | Singleton |
| `ITrickplayManager` | `TrickplayManager` | Singleton |
| `IWebSocketListener` | 4 个监听器（Session/ActivityLog/ScheduledTask/SessionInfo） | Singleton |
| `IAuthorizationContext` | `AuthorizationContext` | Singleton |
| `IAuthenticationManager` | `AuthenticationManager` | Scoped |
| `ILyricProvider` | 自动发现所有实现 | Singleton |
| `ILyricParser` | 自动发现所有实现 | Singleton |

### 5.3 Startup.ConfigureServices() — Web 层服务

在 `Jellyfin.Server/Startup.cs:60-136` 中注册：

| 功能 | 注册方法 |
|------|----------|
| HTTP 响应压缩 | `AddResponseCompression()` |
| HttpContext 访问器 | `AddHttpContextAccessor()` |
| HTTPS 重定向 | `AddHttpsRedirection()` |
| MVC + API 控制器 | `AddJellyfinApi()` — 包含 CORS、ForwardedHeaders、JSON 序列化、插件控制器 |
| EF Core DbContext | `AddJellyfinDbContext()` |
| Swagger/OpenAPI | `AddJellyfinApiSwagger()` |
| 认证 | `AddCustomAuthentication()` — 自定义 API Key 认证 |
| 授权策略 | `AddJellyfinApiAuthorization()` — 17 种授权策略 |
| HttpClient 工厂 | 3 个命名客户端（Default / MusicBrainz / DirectIp） |
| 健康检查 | `AddHealthChecks()` → DbContext 检查 |
| HLS 播放列表 | `AddHlsPlaylistGenerator()` |
| 直播电视 | `AddLiveTvServices()` |
| 后台服务 | 6 个 HostedService（见下表） |

#### 后台 HostedService

| 服务 | 职责 |
|------|------|
| `RecordingsHost` | 录制任务管理 |
| `AutoDiscoveryHost` | UDP 自动发现服务 |
| `NfoUserDataSaver` | NFO 用户数据持久化 |
| `LibraryChangedNotifier` | 媒体库变更通知 |
| `UserDataChangeNotifier` | 用户数据变更通知 |
| `RecordingNotifier` | 录制状态通知 |

### 5.4 事件消费者注册

在 `Jellyfin.Server.Implementations/Events/EventingServiceCollectionExtensions.cs` 中注册：

| 分类 | 消费者 |
|------|--------|
| **媒体库** | `LyricDownloadFailureLogger`, `SubtitleDownloadFailureLogger` |
| **安全认证** | `AuthenticationFailedLogger`, `AuthenticationSucceededLogger` |
| **会话** | `PlaybackStartLogger`, `PlaybackStopLogger`, `SessionEndedLogger`, `SessionStartedLogger` |
| **系统** | `PendingRestartNotifier`, `TaskCompletedLogger`, `TaskCompletedNotifier` |
| **更新** | 插件安装/卸载/更新的日志和通知（共 10 个消费者） |
| **用户** | `UserCreatedLogger`, `UserDeletedLogger/Notifier`, `UserLockedOutLogger`, `UserPasswordChangedLogger`, `UserUpdatedNotifier` |

### 5.5 直播电视服务注册

在 `Jellyfin.LiveTv/Extensions/LiveTvServiceCollectionExtensions.cs` 中注册：

| 服务接口 | 实现类 |
|----------|--------|
| `ILiveTvManager` | `LiveTvManager` |
| `IChannelManager` | `ChannelManager` |
| `ITunerHostManager` | `TunerHostManager` |
| `IListingsManager` | `ListingsManager` |
| `IGuideManager` | `GuideManager` |
| `IRecordingsManager` | `RecordingsManager` |
| `ITunerHost` | `HdHomerunHost`, `M3UTunerHost` |
| `IListingsProvider` | `SchedulesDirect`, `XmlTvListingsProvider` |

---

## 6. 中间件管道

### 6.1 管道顺序

Startup.Configure() 中的中间件按以下顺序执行：

```
请求入口
  │
  ├─ 1. BaseUrlRedirectionMiddleware          ← 在 app.Map() 之外
  │     将不带 BaseUrl 前缀的请求重定向到正确路径
  │
  ╔═══════════════════════════════════════╗
  ║  app.Map(config.BaseUrl, ...)         ║  ← 所有后续中间件在 BaseUrl 路径下
  ╚═══════════════════════════════════════╝
  │
  ├─ 2. DeveloperExceptionPage               ← 仅开发环境
  │
  ├─ 3. ForwardedHeaders                     ← 处理反向代理头（X-Forwarded-For/Proto/Host）
  │
  ├─ 4. ExceptionMiddleware                  ← 全局异常捕获，返回统一错误格式
  │
  ├─ 5. ResponseTimeMiddleware               ← 记录请求耗时到响应头
  │
  ├─ 6. WebSockets                           ← ASP.NET Core WebSocket 支持
  │
  ├─ 7. ResponseCompression                  ← gzip/brotli 响应压缩
  │
  ├─ 8. CORS                                 ← 跨域资源共享
  │
  ├─ 9. HttpsRedirection                     ← 条件：RequireHttps && ListenWithHttps
  │
  ├─ 10. StaticFiles (Web Client)            ← 条件：HostWebClient == true
  │      ├─ DefaultFiles (/web → index.html)
  │      ├─ StaticFiles (/web → 物理路径)
  │      └─ RobotsRedirectionMiddleware       ← /robots.txt 重定向
  │
  ├─ 11. StaticFiles (通用)                   ← 其他静态资源
  │
  ├─ 12. Authentication                      ← ASP.NET Core 认证（CustomAuthenticationHandler）
  │
  ├─ 13. Swagger / ReDoc                     ← API 文档 UI
  │
  ├─ 14. QueryStringDecodingMiddleware       ← URL 查询字符串解码
  │
  ├─ 15. Routing                             ← ASP.NET Core 路由匹配
  │
  ├─ 16. Authorization                       ← ASP.NET Core 授权
  │
  ├─ 17. IPBasedAccessValidationMiddleware   ← IP 白名单/黑名单验证
  │
  ├─ 18. WebSocketHandlerMiddleware          ← Jellyfin WebSocket 处理
  │
  ├─ 19. ServerStartupMessageMiddleware      ← 服务未就绪时返回启动中消息
  │
  ├─ 20. HttpMetrics                         ← 条件：EnableMetrics == true（Prometheus）
  │
  └─ 21. Endpoints
         ├─ MapControllers()                 ← API 控制器路由
         ├─ MapMetrics()                     ← Prometheus /metrics 端点
         └─ MapHealthChecks("/health")       ← 健康检查端点
```

### 6.2 自定义中间件说明

| 中间件 | 文件 | 职责 |
|--------|------|------|
| `BaseUrlRedirectionMiddleware` | `Jellyfin.Api/Middleware/` | 检测请求是否缺少 BaseUrl 前缀，自动重定向 |
| `ExceptionMiddleware` | `Jellyfin.Api/Middleware/` | 捕获未处理异常，记录日志并返回 500 错误 |
| `ResponseTimeMiddleware` | `Jellyfin.Api/Middleware/` | 在响应头中添加 `X-Response-Time-ms` |
| `QueryStringDecodingMiddleware` | `Jellyfin.Api/Middleware/` | 对 URL 编码的查询字符串进行二次解码 |
| `IPBasedAccessValidationMiddleware` | `Jellyfin.Api/Middleware/` | 根据网络配置验证客户端 IP 是否允许访问 |
| `WebSocketHandlerMiddleware` | `Jellyfin.Api/Middleware/` | 处理 WebSocket 升级请求并路由到对应监听器 |
| `ServerStartupMessageMiddleware` | `Jellyfin.Api/Middleware/` | 在核心启动完成前返回 503 和启动中消息 |
| `RobotsRedirectionMiddleware` | `Jellyfin.Api/Middleware/` | 将 `/robots.txt` 重定向到 `/web/robots.txt` |

---

## 7. 关键接口与实现对应关系

### 7.1 核心 Manager 接口

| 接口 (MediaBrowser.Controller) | 实现类 | 所在项目 |
|-------------------------------|--------|----------|
| `ILibraryManager` | `LibraryManager` | Emby.Server.Implementations |
| `ILibraryMonitor` | `LibraryMonitor` | Emby.Server.Implementations |
| `IProviderManager` | `ProviderManager` | MediaBrowser.Providers |
| `ISessionManager` | `SessionManager` | Emby.Server.Implementations |
| `IUserManager` | `UserManager` | Jellyfin.Server.Implementations |
| `IUserDataManager` | `UserDataManager` | Emby.Server.Implementations |
| `IMediaEncoder` | `MediaEncoder` | MediaBrowser.MediaEncoding |
| `IMediaSourceManager` | `MediaSourceManager` | Emby.Server.Implementations |
| `IDtoService` | `DtoService` | Emby.Server.Implementations |
| `IImageProcessor` | `ImageProcessor` | Emby.Server.Implementations |
| `IImageEncoder` | `SkiaEncoder` / `NullImageEncoder` | Jellyfin.Drawing.Skia / Jellyfin.Drawing |
| `ILiveTvManager` | `LiveTvManager` | Jellyfin.LiveTv |
| `IChannelManager` | `ChannelManager` | Jellyfin.LiveTv |
| `IRecordingsManager` | `RecordingsManager` | Jellyfin.LiveTv |
| `ISubtitleManager` | `SubtitleManager` | Emby.Server.Implementations |
| `ILyricManager` | `LyricManager` | MediaBrowser.Providers |
| `ITranscodeManager` | `TranscodeManager` | MediaBrowser.MediaEncoding |
| `ICollectionManager` | `CollectionManager` | Emby.Server.Implementations |
| `IPlaylistManager` | `PlaylistManager` | Emby.Server.Implementations |
| `ISyncPlayManager` | `SyncPlayManager` | Emby.Server.Implementations |
| `ISearchEngine` | `SearchEngine` | Emby.Server.Implementations |
| `ITVSeriesManager` | `TVSeriesManager` | Emby.Server.Implementations |

### 7.2 数据持久化接口

| 接口 (MediaBrowser.Controller) | 实现类 | 所在项目 |
|-------------------------------|--------|----------|
| `IItemRepository` | `BaseItemRepository` | Jellyfin.Server.Implementations |
| `IPeopleRepository` | `PeopleRepository` | Jellyfin.Server.Implementations |
| `IChapterRepository` | `ChapterRepository` | Emby.Server.Implementations |
| `IMediaAttachmentRepository` | `MediaAttachmentRepository` | Emby.Server.Implementations |
| `IMediaStreamRepository` | `MediaStreamRepository` | Emby.Server.Implementations |
| `IMediaSegmentManager` | `MediaSegmentManager` | Jellyfin.Server.Implementations |

### 7.3 安全与认证

| 接口 | 实现类 | 所在项目 |
|------|--------|----------|
| `IAuthService` | `AuthService` | Emby.Server.Implementations |
| `IAuthorizationContext` | `AuthorizationContext` | Emby.Server.Implementations |
| `IAuthenticationProvider` | `DefaultAuthenticationProvider` | Jellyfin.Server.Implementations |
| `IAuthenticationProvider` | `InvalidAuthProvider` | Jellyfin.Server.Implementations |
| `IAuthenticationManager` | `AuthenticationManager` | Jellyfin.Server.Implementations |
| `IQuickConnect` | `QuickConnectManager` | Emby.Server.Implementations |

### 7.4 基础设施

| 接口 | 实现类 | 所在项目 |
|------|--------|----------|
| `INetworkManager` | `NetworkManager` | Jellyfin.Networking |
| `ITaskManager` | `TaskManager` | Emby.Server.Implementations |
| `IInstallationManager` | `InstallationManager` | Emby.Server.Implementations |
| `ILocalizationManager` | `LocalizationManager` | Emby.Server.Implementations |
| `ICryptoProvider` | `CryptographyProvider` | Emby.Server.Implementations |
| `IFileSystem` | `ManagedFileSystem` | Emby.Server.Implementations |
| `IEventManager` | `EventManager` | Jellyfin.Server.Implementations |
| `IActivityManager` | `ActivityManager` | Jellyfin.Server.Implementations |
| `IDeviceManager` | `DeviceManager` | Jellyfin.Server.Implementations |
| `IBackupService` | `BackupService` | Jellyfin.Server.Implementations |
| `IJellyfinDatabaseProvider` | `SqliteDatabaseProvider` | Jellyfin.Database.Providers.Sqlite |

### 7.5 WebSocket 监听器

| 接口 | 实现类 | 职责 |
|------|--------|------|
| `IWebSocketListener` | `SessionWebSocketListener` | 会话心跳与命令 |
| `IWebSocketListener` | `ActivityLogWebSocketListener` | 活动日志实时推送 |
| `IWebSocketListener` | `ScheduledTasksWebSocketListener` | 计划任务状态推送 |
| `IWebSocketListener` | `SessionInfoWebSocketListener` | 会话信息实时推送 |

---

## 8. 程序集发现机制

`ApplicationHost.GetComposablePartAssemblies()` 返回所有可组合的程序集，用于类型发现和插件加载：

```csharp
// 插件程序集（动态加载）
_pluginManager.LoadAssemblies()

// 核心程序集（硬编码）
typeof(SystemInfo).Assembly                    // MediaBrowser.Model
typeof(IApplicationHost).Assembly              // MediaBrowser.Common
typeof(IServerApplicationHost).Assembly        // MediaBrowser.Controller
typeof(ProviderManager).Assembly               // MediaBrowser.Providers
typeof(PhotoProvider).Assembly                 // Emby.Photos
typeof(InstallationManager).Assembly           // Emby.Server.Implementations
typeof(MediaEncoder).Assembly                  // MediaBrowser.MediaEncoding
typeof(BoxSetXmlSaver).Assembly                // MediaBrowser.LocalMetadata
typeof(ArtistNfoProvider).Assembly             // MediaBrowser.XbmcMetadata
typeof(NetworkManager).Assembly                // Jellyfin.Networking
typeof(DynamicHlsPlaylistGenerator).Assembly   // Jellyfin.MediaEncoding.Hls

// CoreAppHost 额外添加
typeof(CoreAppHost).Assembly                   // Jellyfin.Server
typeof(JellyfinDbContext).Assembly             // Jellyfin.Database.Implementations
typeof(ServiceCollectionExtensions).Assembly   // Jellyfin.Server.Implementations
typeof(LiveTvManager).Assembly                 // Jellyfin.LiveTv
```

这些程序集中的所有 **非抽象、非接口、非泛型的公开具体类** 都会被发现，用于：
- `GetExportTypes<T>()` — 按接口查找所有实现类型
- `GetExports<T>()` — 实例化所有实现并注册为可释放部件
- `GetApiPluginAssemblies()` — 查找包含 Controller 的程序集供 MVC 注册

---

## 9. 配置系统

### 9.1 配置加载优先级（由低到高）

```
1. 内存默认值 (ConfigurationOptions.DefaultConfiguration)
2. logging.default.json  — 默认日志配置
3. logging.json          — 用户日志覆盖配置
4. 环境变量 JELLYFIN_*   — 环境变量覆盖
5. 命令行参数            — 最高优先级
```

### 9.2 ServerConfigurationManager

- 读取/写入 `system.xml` 服务器主配置
- 支持命名配置（如 `network.xml`、`database` 配置段）
- 通过 `IConfigurationFactory` 插件扩展配置段
- 配置变更触发 `ConfigurationUpdated` / `NamedConfigurationUpdated` 事件

### 9.3 数据库配置

通过 `AddJellyfinDbContext()` 扩展方法配置：

- 支持内建 SQLite（默认）
- 支持自定义数据库插件（`PLUGIN_PROVIDER` 类型）
- 可配置锁定行为：NoLock / Pessimistic / Optimistic
- 使用 `PooledDbContextFactory<JellyfinDbContext>` 提升性能

---

## 10. 关键设计特点总结

1. **分层清晰**：Model → Common → Controller → Implementations 四层依赖方向严格单向
2. **接口驱动**：所有核心功能通过 `MediaBrowser.Controller` 中的接口定义，实现分散在多个项目
3. **组合根模式**：`ApplicationHost` 作为 DI 组合根，集中注册 60+ 服务
4. **插件体系**：通过程序集扫描 + PluginManager 实现插件发现和加载
5. **历史遗留**：`SetStaticProperties()` 中的静态属性注入是 Emby 时代遗留，正在逐步重构
6. **支持热重启**：通过 `do-while` 循环和 `ShouldRestart` 标志实现不重启进程的服务重启
7. **双 Web 服务器**：启动时先运行 SetupServer（配置向导），完成后切换到主 Kestrel 服务器
8. **迁移系统**：三阶段迁移（PreInitialisation → CoreInitialisation → AppInitialisation）
