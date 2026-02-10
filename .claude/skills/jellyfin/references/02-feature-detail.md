# Jellyfin 核心功能模块详细分析

> 本文档按功能模块逐个追踪 **前端路由 → API 调用 → Controller → Service → Repository** 完整链路，深入分析 Jellyfin 的核心功能实现。

---

## 目录

- [1. 媒体库管理](#1-媒体库管理)
- [2. 视频播放](#2-视频播放)
- [3. 用户认证](#3-用户认证)
- [4. 元数据管理](#4-元数据管理)
- [5. SyncPlay 同步播放](#5-syncplay-同步播放)
- [6. Live TV 直播电视与 DVR](#6-live-tv-直播电视与-dvr)
- [7. 定时任务](#7-定时任务)
- [8. 备份与恢复](#8-备份与恢复)

---

## 1. 媒体库管理

### 1.1 功能描述

媒体库管理是 Jellyfin 的核心功能之一，负责媒体库（Virtual Folder）的创建、删除、重命名、路径管理、配置选项编辑，以及媒体库内容的浏览、搜索和过滤。管理员通过 Dashboard 创建和管理媒体库结构，普通用户通过首页浏览各媒体库中的内容。

### 1.2 前端路由和页面组件

#### 管理员 Dashboard 路由

路由定义文件：`jellyfin-web-master/src/apps/dashboard/routes/_asyncRoutes.ts`

| URL 路径 | 页面组件 |
|----------|----------|
| `/dashboard/libraries` | `dashboard/routes/libraries/index.tsx` — 媒体库列表页，含「添加媒体库」和「扫描全部」按钮 |
| `/dashboard/libraries/display` | `dashboard/routes/libraries/display.tsx` — 显示设置 |
| `/dashboard/libraries/metadata` | `dashboard/routes/libraries/metadata.tsx` — 元数据语言配置 |
| `/dashboard/libraries/nfo` | `dashboard/routes/libraries/nfo.tsx` — NFO 文件配置 |

所有 Dashboard 路由包裹在 `<ConnectionRequired level='admin' />` 中，需要管理员认证。

#### 用户内容浏览路由

路由定义文件：`jellyfin-web-master/src/apps/stable/routes/legacyRoutes/user.ts`

| URL 路径 | Controller | View | 说明 |
|----------|------------|------|------|
| `/home` | `home` | `home.html` | 首页，展示各媒体库概览 |
| `/movies` | `movies/moviesrecommended` | `movies/movies.html` | 电影库浏览 |
| `/tv` | `shows/tvrecommended` | `shows/tvrecommended.html` | 电视剧库浏览 |
| `/music` | `music/musicrecommended` | `music/music.html` | 音乐库浏览 |
| `/list` | `list` | `list.html` | 通用列表页 |
| `/details` | `itemDetails/index` | `itemDetails/index.html` | 单项详情页 |

#### 关键前端组件

| 组件 | 路径 | 用途 |
|------|------|------|
| LibraryCard | `dashboard/features/libraries/components/LibraryCard.tsx` | 媒体库卡片，右键菜单支持编辑、重命名、扫描、删除 |
| useVirtualFolders | `dashboard/features/libraries/api/useVirtualFolders.ts` | TanStack Query Hook，调用 `GET /Library/VirtualFolders` |
| useRemoveVirtualFolder | `dashboard/features/libraries/api/useRemoveVirtualFolder.ts` | 删除媒体库 Mutation |
| useRenameVirtualFolder | `dashboard/features/libraries/api/useRenameVirtualFolder.ts` | 重命名媒体库 Mutation |
| MediaLibraryCreator | `components/mediaLibraryCreator/mediaLibraryCreator.js` | 新建媒体库对话框（Legacy） |
| MediaLibraryEditor | `components/mediaLibraryEditor/mediaLibraryEditor.js` | 编辑媒体库路径/选项对话框（Legacy） |
| libraryoptionseditor | `components/libraryoptionseditor/libraryoptionseditor.js` | 元数据提供器/字幕选项子组件 |

### 1.3 后端 Controller 和 API 端点

#### LibraryStructureController

文件：`Jellyfin.Api/Controllers/LibraryStructureController.cs`
路由前缀：`/Library/VirtualFolders`
权限：`FirstTimeSetupOrElevated`（管理员）

| HTTP | 路由 | 方法 | 说明 |
|------|------|------|------|
| GET | `/Library/VirtualFolders` | `GetVirtualFolders()` | 列出所有媒体库 |
| POST | `/Library/VirtualFolders` | `AddVirtualFolder(name, collectionType, paths, libraryOptionsDto)` | 创建新媒体库 |
| DELETE | `/Library/VirtualFolders` | `RemoveVirtualFolder(name)` | 删除媒体库 |
| POST | `/Library/VirtualFolders/Name` | `RenameVirtualFolder(name, newName)` | 重命名媒体库 |
| POST | `/Library/VirtualFolders/Paths` | `AddMediaPath(mediaPathDto)` | 向媒体库添加文件夹路径 |
| POST | `/Library/VirtualFolders/Paths/Update` | `UpdateMediaPath(mediaPathRequestDto)` | 更新文件夹路径配置 |
| DELETE | `/Library/VirtualFolders/Paths` | `RemoveMediaPath(name, path)` | 从媒体库移除文件夹路径 |
| POST | `/Library/VirtualFolders/LibraryOptions` | `UpdateLibraryOptions(request)` | 更新媒体库配置选项 |

#### LibraryController

文件：`Jellyfin.Api/Controllers/LibraryController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| POST | `/Library/Refresh` | 触发全库扫描（管理员） |
| DELETE | `/Items/{itemId}` | 从库中删除单个项目 |
| DELETE | `/Items` | 批量删除项目 |
| GET | `/Items/Counts` | 获取各类型项目数量统计 |
| GET | `/Items/{itemId}/Ancestors` | 获取项目父级链 |
| GET | `/Items/{itemId}/Similar` | 获取相似项目 |
| GET | `/Libraries/AvailableOptions` | 获取可用的元数据提供器列表 |
| GET | `/Items/{itemId}/Download` | 下载项目原始文件 |

#### ItemsController

文件：`Jellyfin.Api/Controllers/ItemsController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Items` | **主查询端点** — 支持 60+ 过滤参数，浏览/搜索所有库内容 |
| GET | `/UserItems/Resume` | 获取可恢复播放的项目 |
| GET | `/UserItems/{itemId}/UserData` | 获取用户特定数据（播放进度、收藏状态等） |
| POST | `/UserItems/{itemId}/UserData` | 更新用户特定数据 |

#### UserLibraryController

文件：`Jellyfin.Api/Controllers/UserLibraryController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Items/{itemId}` | 获取单个项目完整元数据 |
| GET | `/Items/Root` | 获取用户根文件夹 |
| GET | `/Items/Latest` | 获取最新添加的媒体 |
| POST | `/UserFavoriteItems/{itemId}` | 标记为收藏 |
| DELETE | `/UserFavoriteItems/{itemId}` | 取消收藏 |

#### UserViewsController

文件：`Jellyfin.Api/Controllers/UserViewsController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/UserViews` | 获取用户的媒体库视图列表（首页展示的顶级分类） |

### 1.4 Service 接口

#### ILibraryManager

文件：`MediaBrowser.Controller/Library/ILibraryManager.cs`

```csharp
// 媒体库结构管理
List<VirtualFolderInfo> GetVirtualFolders();
Task AddVirtualFolder(string name, CollectionTypeOptions? collectionType, LibraryOptions options, bool refreshLibrary);
Task RemoveVirtualFolder(string name, bool refreshLibrary);
void AddMediaPath(string virtualFolderName, MediaPathInfo mediaPath);
void UpdateMediaPath(string virtualFolderName, MediaPathInfo mediaPath);
void RemoveMediaPath(string virtualFolderName, string mediaPath);

// 项目 CRUD
BaseItem? GetItemById(Guid id);
void CreateItem(BaseItem item, BaseItem? parent);
Task UpdateItemAsync(BaseItem item, BaseItem parent, ItemUpdateType updateReason, CancellationToken ct);
void DeleteItem(BaseItem item, DeleteOptions options);

// 查询
IReadOnlyList<BaseItem> GetItemList(InternalItemsQuery query);
QueryResult<BaseItem> GetItemsResult(InternalItemsQuery query);
ItemCounts GetItemCounts(InternalItemsQuery query);

// 扫描
Task ValidateMediaLibrary(IProgress<double> progress, CancellationToken ct);
void QueueLibraryScan();
```

#### IItemRepository

文件：`MediaBrowser.Controller/Persistence/IItemRepository.cs`

```csharp
void SaveItems(IReadOnlyList<BaseItem> items, CancellationToken ct);
void DeleteItem(params IReadOnlyList<Guid> ids);
BaseItem RetrieveItem(Guid id);
QueryResult<BaseItem> GetItems(InternalItemsQuery filter);
IReadOnlyList<BaseItem> GetItemList(InternalItemsQuery filter);
int GetCount(InternalItemsQuery filter);
```

### 1.5 实现文件

| 接口 | 实现类 | 文件路径 |
|------|--------|----------|
| `ILibraryManager` | `LibraryManager` | `Emby.Server.Implementations/Library/LibraryManager.cs` |
| `IItemRepository` | `BaseItemRepository` | `Jellyfin.Server.Implementations/Item/BaseItemRepository.cs` |

### 1.6 关键数据流

#### 流程 1：列出所有媒体库

```
前端 /dashboard/libraries
  → useVirtualFolders() Hook
    → GET /Library/VirtualFolders
      → LibraryStructureController.GetVirtualFolders()
        → ILibraryManager.GetVirtualFolders(true)
          → 枚举 DefaultUserViewsPath 下的目录
          → 解析 .mblink 快捷方式文件获取物理路径
          → 匹配内存中的 CollectionFolder 对象
          → 返回 List<VirtualFolderInfo>
```

#### 流程 2：创建新媒体库

```
前端 "添加媒体库" 按钮
  → MediaLibraryCreator 对话框
    → ApiClient.addVirtualFolder(name, type, refresh, libraryOptions)
      → POST /Library/VirtualFolders?name=X&collectionType=Y&refreshLibrary=true

后端 LibraryStructureController.AddVirtualFolder()
  → ILibraryManager.AddVirtualFolder()
    1. LibraryMonitor.Stop()
    2. Directory.CreateDirectory(virtualFolderPath)
    3. 创建 "{collectionType}.collection" 标记文件
    4. CollectionFolder.SaveLibraryOptions() — 保存配置到 options.xml
    5. 为每个路径创建 .mblink 快捷方式文件
    6. ValidateTopLibraryFolders()
    7. 如 refreshLibrary=true → StartScanInBackground()
```

#### 流程 3：浏览媒体库内容

```
前端 /movies → movies/moviesrecommended Controller
  → GET /UserViews
    → UserViewsController.GetUserViews() → IUserViewManager.GetUserViews()
  → GET /Items?parentId=<libraryId>&includeItemTypes=Movie&recursive=true
    → ItemsController.GetItems()
      → ILibraryManager.GetParentItem(parentId) — 解析媒体库文件夹
      → folder.GetItems(query)
        → ILibraryManager.GetItemsResult(query)
          → IItemRepository.GetItems(query) — EF Core LINQ 查询 BaseItemEntity
```

### 1.7 架构要点

1. **无独立 ILibraryStructureService**：`LibraryStructureController` 直接调用 `ILibraryManager`，媒体库结构管理是 `ILibraryManager` 接口的一部分。
2. **双存储模型**：媒体库*结构*（虚拟文件夹、路径、选项）基于文件系统（目录、`.mblink` 快捷方式、`.collection` 标记、`options.xml`）；媒体库*内容*（项目、元数据、用户数据）存储在数据库中（EF Core + `JellyfinDbContext`）。
3. **前端架构分离**：管理员 Dashboard 使用现代 React + TanStack Query Hooks；内容浏览页（`/home`, `/movies`, `/tv`）仍使用 Legacy ViewManager 模式。

---

## 2. 视频播放

### 2.1 功能描述

视频播放是 Jellyfin 最复杂的功能模块之一。它实现了从用户点击播放到视频流传输的完整链路，包括：设备能力协商（DeviceProfile）、播放方式决策（DirectPlay / DirectStream / Transcode）、HLS 自适应码率转码、FFmpeg 进程管理、播放状态上报和转码会话保活。

### 2.2 前端路由和播放器组件

#### 路由定义

文件：`jellyfin-web-master/src/apps/stable/routes/legacyRoutes/user.ts`

| URL 路径 | Controller | View | 说明 |
|----------|------------|------|------|
| `/video` | `playback/video/index` | `playback/video/index.html` | 视频播放器 OSD 页面（全屏） |
| `/queue` | `playback/queue/index` | `playback/queue/index.html` | 播放队列页面 |
| `/mypreferencesplayback` | `user/playback/index` | `user/playback/index.html` | 播放偏好设置 |

#### 核心播放器组件

| 组件 | 路径 | 说明 |
|------|------|------|
| **PlaybackManager** | `components/playback/playbackmanager.js` | **核心编排器** — 协调播放全流程 |
| **HtmlVideoPlayer** | `plugins/htmlVideoPlayer/plugin.js` | HTML5 `<video>` 播放器插件 |
| Video OSD Controller | `controllers/playback/video/index.js` | 视频 OSD 控制器 |
| Video OSD Template | `controllers/playback/video/index.html` | OSD 界面模板 |
| PlayQueueManager | `components/playback/playqueuemanager.js` | 播放队列管理 |
| htmlMediaHelper | `components/htmlMediaHelper.js` | HTML 媒体辅助工具 |
| browserDeviceProfile | `scripts/browserDeviceProfile.js` | 浏览器设备能力描述构建 |
| PlayerSelectionMenu | `components/playback/playerSelectionMenu.js` | 播放器选择菜单 |
| SkipSegment | `components/playback/skipsegment.ts` | 片段跳过功能 |
| MediaSegmentManager | `apps/stable/features/playback/utils/mediaSegmentManager.ts` | 媒体片段管理 |
| PlaybackSubscriber | `apps/stable/features/playback/utils/playbackSubscriber.ts` | 播放事件订阅 |

### 2.3 后端 Controller 和 API 端点

#### VideosController

文件：`Jellyfin.Api/Controllers/VideosController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **GET/HEAD** | **`/Videos/{itemId}/stream`** | **主要渐进式视频流端点** — 返回直接文件、远程流或 FFmpeg 转码流 |
| GET/HEAD | `/Videos/{itemId}/stream.{container}` | 带容器扩展名的流端点，委托给上方方法 |
| GET | `/Videos/{itemId}/AdditionalParts` | 获取多部分视频的附加部分 |
| POST | `/Videos/MergeVersions` | 合并多个视频版本（管理员） |

`GetVideoStream` 核心逻辑：
1. 构建 `VideoRequestDto`
2. 调用 `StreamingHelpers.GetStreamingState()` 解析媒体源
3. 静态 + 本地文件 → 直接返回文件流
4. 静态 + 远程 HTTP → 代理远程流
5. 需要转码 → 通过 `EncodingHelper` 构建 FFmpeg 命令行，启动转码

#### MediaInfoController

文件：`Jellyfin.Api/Controllers/MediaInfoController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Items/{itemId}/PlaybackInfo` | 简单播放信息获取 |
| **POST** | **`/Items/{itemId}/PlaybackInfo`** | **关键协商端点** — 客户端发送 DeviceProfile，服务端返回标注了 DirectPlay/DirectStream/Transcode 的 MediaSources |
| POST | `/LiveStreams/Open` | 打开直播流 |
| POST | `/LiveStreams/Close` | 关闭直播流 |
| GET | `/Playback/BitrateTest` | 网络带宽测试（返回随机字节） |

`GetPostedPlaybackInfo` 关键流程：
1. 获取媒体源 → `IMediaSourceManager.GetPlaybackMediaSources()`
2. 对每个媒体源评估设备兼容性 → `StreamBuilder.GetOptimalVideoStream()` 判断 PlayMethod
3. 设置 `TranscodingUrl`（如 `/Videos/{id}/master.m3u8?...`）
4. 返回 `PlaybackInfoResponse { MediaSources[], PlaySessionId }`

#### DynamicHlsController

文件：`Jellyfin.Api/Controllers/DynamicHlsController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **GET/HEAD** | **`/Videos/{itemId}/master.m3u8`** | HLS 主播放列表（含变体流，支持自适应码率） |
| **GET** | **`/Videos/{itemId}/main.m3u8`** | HLS 变体播放列表（含分片列表，按需启动 FFmpeg） |
| **GET** | **`/Videos/{itemId}/hls1/{playlistId}/{segmentId}.{container}`** | HLS 视频分片（.ts/.mp4 文件） |
| GET | `/Audio/{itemId}/master.m3u8` | HLS 音频主播放列表 |
| GET | `/Videos/{itemId}/live.m3u8` | 直播 HLS 流 |

#### PlaystateController

文件：`Jellyfin.Api/Controllers/PlaystateController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **POST** | **`/Sessions/Playing`** | 上报播放开始 |
| **POST** | **`/Sessions/Playing/Progress`** | 上报播放进度（每 ~10 秒） |
| **POST** | **`/Sessions/Playing/Ping`** | 转码会话保活心跳 |
| **POST** | **`/Sessions/Playing/Stopped`** | 上报播放停止，终止转码作业 |
| POST | `/UserPlayedItems/{itemId}` | 标记为已播放 |
| DELETE | `/UserPlayedItems/{itemId}` | 标记为未播放 |

#### HlsSegmentController

文件：`Jellyfin.Api/Controllers/HlsSegmentController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **DELETE** | **`/Videos/ActiveEncodings`** | 停止活跃的转码作业 |
| GET | 多个 Legacy 路由 | 兼容旧版 HLS 分片请求 |

### 2.4 Service 接口

#### IMediaSourceManager

文件：`MediaBrowser.Controller/Library/IMediaSourceManager.cs`

```csharp
// 核心方法
Task<IReadOnlyList<MediaSourceInfo>> GetPlaybackMediaSources(BaseItem item, User user, bool allowMediaProbe, bool enablePathSubstitution, CancellationToken ct);
Task<MediaSourceInfo> GetMediaSource(BaseItem item, string mediaSourceId, string liveStreamId, bool enablePathSubstitution, CancellationToken ct);
IReadOnlyList<MediaStream> GetMediaStreams(Guid itemId);
void SetDefaultAudioAndSubtitleStreamIndices(BaseItem item, MediaSourceInfo source, User user);

// 直播流
Task<LiveStreamResponse> OpenLiveStream(LiveStreamRequest request, CancellationToken ct);
Task CloseLiveStream(string id);
```

#### ITranscodeManager

文件：`MediaBrowser.Controller/MediaEncoding/ITranscodeManager.cs`

```csharp
TranscodingJob? GetTranscodingJob(string playSessionId);
Task<TranscodingJob> StartFfMpeg(StreamState state, string outputPath, string commandLineArguments, Guid userId, TranscodingJobType type, CancellationTokenSource cts, string? workingDirectory);
void PingTranscodingJob(string playSessionId, bool? isUserPaused);
Task KillTranscodingJobs(string deviceId, string? playSessionId, Func<string, bool> deleteFiles);
TranscodingJob? OnTranscodeBeginRequest(string path, TranscodingJobType type);
void OnTranscodeEndRequest(TranscodingJob job);
```

#### IMediaEncoder

文件：`MediaBrowser.Controller/MediaEncoding/IMediaEncoder.cs`

```csharp
Task<MediaInfo> GetMediaInfo(MediaInfoRequest request, CancellationToken ct);  // FFprobe 探测
bool SupportsEncoder(string encoder);
bool SupportsDecoder(string decoder);
bool SupportsHwaccel(string hwaccel);  // 硬件加速支持检测
string GetInputArgument(string inputFile, MediaSourceInfo mediaSource);
```

### 2.5 实现文件

| 接口 | 实现类 | 文件路径 |
|------|--------|----------|
| `IMediaEncoder` | `MediaEncoder` | `MediaBrowser.MediaEncoding/Encoder/MediaEncoder.cs` |
| `ITranscodeManager` | `TranscodeManager` | `MediaBrowser.MediaEncoding/Transcoding/TranscodeManager.cs` |
| `IMediaSourceManager` | `MediaSourceManager` | `Emby.Server.Implementations/Library/MediaSourceManager.cs` |

**关键辅助类**（Controller 和 Service 之间的中间层）：

| 辅助类 | 路径 |
|--------|------|
| `MediaInfoHelper` | `Jellyfin.Api/Helpers/MediaInfoHelper.cs` |
| `StreamingHelpers` | `Jellyfin.Api/Helpers/StreamingHelpers.cs` |
| `FileStreamResponseHelpers` | `Jellyfin.Api/Helpers/FileStreamResponseHelpers.cs` |
| `DynamicHlsHelper` | `Jellyfin.Api/Helpers/DynamicHlsHelper.cs` |
| `AudioHelper` | `Jellyfin.Api/Helpers/AudioHelper.cs` |
| `EncodingHelper` | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` |
| `StreamBuilder` | `MediaBrowser.Model/Dlna/StreamBuilder.cs` — DLNA Profile 评估器 |

### 2.6 完整播放数据流

#### 阶段 1：用户点击播放

```
playbackmanager.js → self.play(options)
  → getItemsForPlayback()        — GET /Items?Ids=...
  → translateItemsForPlayback()   — 处理播放列表项
  → getAdditionalParts()          — 多部分电影支持
  → playWithIntros()              — 获取并前插片头
  → playInternal()                — 进入内部播放流程
```

#### 阶段 2：播放协商

```
playbackmanager.js → playAfterBitrateDetect()
  → player.getDeviceProfile()     — 构建浏览器能力描述（本地）
  → getPlaybackMediaSource()
    → getPlaybackInfo()
      → POST /Items/{itemId}/PlaybackInfo  { DeviceProfile, ... }

后端 MediaInfoController.GetPostedPlaybackInfo()
  → MediaInfoHelper.GetPlaybackInfo()
    → IMediaSourceManager.GetPlaybackMediaSources()
  → MediaInfoHelper.SetDeviceSpecificData()
    → StreamBuilder.GetOptimalVideoStream()
      判断每个媒体源: DirectPlay / DirectStream / Transcode
      设置 TranscodingUrl (如 /Videos/{id}/master.m3u8?...)
  → 返回 PlaybackInfoResponse { MediaSources[], PlaySessionId }

前端 → getOptimalMediaSource() — 选择最佳媒体源
```

#### 阶段 3：URL 构建与播放器启动

```
playbackmanager.js → createStreamInfo()
  DirectPlay:   url = mediaSource.Path（原始文件路径）
  DirectStream: url = /Videos/{id}/stream.{container}?Static=true&...
  Transcode:    url = /Videos/{id}/master.m3u8?...（服务端提供的 TranscodingUrl）

→ HtmlVideoPlayer.play(streamInfo)
  → setCurrentSrc()
    HLS → 使用 hls.js 加载 master.m3u8 → main.m3u8 → .ts 分片
    Direct → 直接设置 <video src="...">
```

#### 阶段 4：后端流服务

```
DirectStream:
  GET /Videos/{id}/stream.{container}?Static=true
    → VideosController.GetVideoStream()
      → StreamingHelpers.GetStreamingState()
      → 返回静态文件流

HLS 转码（Web 端常见路径）:
  1. GET /Videos/{id}/master.m3u8    → 返回主播放列表
  2. GET /Videos/{id}/main.m3u8      → 启动 FFmpeg，返回分片列表
  3. GET /Videos/{id}/hls1/.../N.ts  → 返回已转码分片
     → ITranscodeManager.OnTranscodeBeginRequest() — 标记分片使用中
     → 等待分片文件就绪
     → 返回 .ts 分片
     → ITranscodeManager.OnTranscodeEndRequest()
```

#### 阶段 5：播放状态上报

```
播放开始: POST /Sessions/Playing
  → ISessionManager.OnPlaybackStart()

每 ~10 秒: POST /Sessions/Playing/Progress
  → ISessionManager.OnPlaybackProgress()

转码保活: POST /Sessions/Playing/Ping
  → ITranscodeManager.PingTranscodingJob()

播放停止: POST /Sessions/Playing/Stopped
  → ITranscodeManager.KillTranscodingJobs()
  → ISessionManager.OnPlaybackStopped()

清理转码: DELETE /Videos/ActiveEncodings
  → ITranscodeManager.KillTranscodingJobs()
```

#### 完整流程图

```
用户点击播放
    │
    ▼
PlaybackManager.play()
    │
    ├── GET /Items/{id}                          ← 获取项目信息
    ├── GET /Playback/BitrateTest                ← 测试带宽
    ├── 构建 DeviceProfile（本地）
    │
    ▼
POST /Items/{id}/PlaybackInfo                    ← 播放协商
    │   { DeviceProfile, MediaSourceId, ... }
    │
    ▼
MediaInfoController → StreamBuilder
    │   判断: DirectPlay / DirectStream / Transcode
    │   返回: MediaSources[] + PlaySessionId
    │
    ▼
createStreamInfo() → 选择最佳源，构建流 URL
    │
    ├── [DirectPlay]   → <video src="文件路径">
    ├── [DirectStream]  → GET /Videos/{id}/stream.mp4?Static=true
    │                     → VideosController → 返回静态文件
    └── [HLS 转码]      → hls.js
         ├── GET master.m3u8  → DynamicHlsController → 主播放列表
         ├── GET main.m3u8    → 启动 FFmpeg → 分片列表
         └── GET *.ts         → 返回转码分片
    │
    ▼
状态上报循环
    ├── POST /Sessions/Playing          ← 开始
    ├── POST /Sessions/Playing/Progress ← 进度（10s）
    ├── POST /Sessions/Playing/Ping     ← 保活
    └── POST /Sessions/Playing/Stopped  ← 停止
```

---

## 3. 用户认证

### 3.1 功能描述

用户认证模块负责用户登录、登出、会话管理、QuickConnect 免密登录、密码重置、API Key 管理以及前端路由守卫。支持插件式认证提供器（可扩展 LDAP 等第三方认证）。

### 3.2 前端路由和认证组件

#### 公共路由（无需认证）

路由定义文件：`jellyfin-web-master/src/apps/stable/routes/legacyRoutes/public.ts`

| URL 路径 | Controller | 说明 |
|----------|------------|------|
| `/addserver` | `session/addServer/index` | 添加服务器 |
| `/selectserver` | `session/selectServer/index` | 选择服务器 |
| `/login` | `session/login/index` | 登录页面 |
| `/forgotpasswordpin` | `session/resetPassword/index` | PIN 码重置密码 |
| `/forgotpassword` | `session/forgotPassword`（React async） | 忘记密码 |

#### 设置向导路由

文件：`jellyfin-web-master/src/apps/wizard/routes/routes.tsx`

路由：`/wizard/start`, `/wizard/user`, `/wizard/settings`, `/wizard/library`, `/wizard/remoteaccess`, `/wizard/finish`

#### 关键前端组件

| 组件 | 路径 | 说明 |
|------|------|------|
| **ConnectionRequired** | `components/ConnectionRequired.tsx` | **核心路由守卫** — 检查连接状态和认证状态，按需重定向 |
| Login Controller | `controllers/session/login/index.js` | 登录逻辑：用户名密码认证 + QuickConnect |
| Login Template | `controllers/session/login/index.html` | 登录页面模板 |
| SelectServer | `controllers/session/selectServer/index.js` | 服务器选择 |
| AddServer | `controllers/session/addServer/index.js` | 添加服务器 |
| ResetPassword | `controllers/session/resetPassword/index.js` | PIN 码密码重置 |

### 3.3 后端 Controller 和 API 端点

#### UserController

文件：`Jellyfin.Api/Controllers/UserController.cs`
路由前缀：`/Users`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Users/Public` | 获取公开用户列表（登录页显示头像，无需认证） |
| **POST** | **`/Users/AuthenticateByName`** | **主要登录端点** — 用户名 + 密码认证 |
| **POST** | **`/Users/AuthenticateWithQuickConnect`** | QuickConnect 认证 |
| GET | `/Users/Me` | 获取当前认证用户 |
| GET | `/Users` | 获取所有用户（需认证） |
| POST | `/Users/New` | 创建用户（管理员） |
| DELETE | `/Users/{userId}` | 删除用户（管理员，撤销所有令牌） |
| POST | `/Users/Password` | 修改密码 |
| POST | `/Users/ForgotPassword` | 发起忘记密码流程 |
| POST | `/Users/ForgotPassword/Pin` | 兑换 PIN 码重置密码 |
| POST | `/Users/{userId}/Policy` | 更新用户策略（管理员） |
| POST | `/Users/Configuration` | 更新用户配置 |

#### SessionController

文件：`Jellyfin.Api/Controllers/SessionController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Sessions` | 获取所有活跃会话 |
| **POST** | **`/Sessions/Logout`** | **登出** — 结束会话，撤销令牌 |
| POST | `/Sessions/Capabilities` | 上报客户端能力 |
| GET | `/Auth/Providers` | 获取认证提供器列表（管理员） |

#### QuickConnectController

文件：`Jellyfin.Api/Controllers/QuickConnectController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/QuickConnect/Enabled` | 检查 QuickConnect 是否启用 |
| POST | `/QuickConnect/Initiate` | 发起 QuickConnect 请求（返回 Secret + 6 位 Code） |
| GET | `/QuickConnect/Connect?secret=` | 轮询 QuickConnect 请求状态 |
| POST | `/QuickConnect/Authorize?code=` | 授权 QuickConnect 请求（需已认证） |

### 3.4 Service 接口

#### IUserManager

文件：`MediaBrowser.Controller/Library/IUserManager.cs`

```csharp
Task<User?> AuthenticateUser(string username, string password, string remoteEndPoint, bool isUserSession);
User? GetUserById(Guid id);
User? GetUserByName(string name);
Task<User> CreateUserAsync(string name);
Task DeleteUserAsync(Guid userId);
Task ChangePassword(User user, string newPassword);
Task ResetPassword(User user);
Task<ForgotPasswordResult> StartForgotPasswordProcess(string enteredUsername, bool isInNetwork);
Task<PinRedeemResult> RedeemPasswordResetPin(string pin);
NameIdPair[] GetAuthenticationProviders();
```

#### ISessionManager

文件：`MediaBrowser.Controller/Session/ISessionManager.cs`

```csharp
Task<AuthenticationResult> AuthenticateNewSession(AuthenticationRequest request);     // 创建新会话（带密码验证）
Task<AuthenticationResult> AuthenticateDirect(AuthenticationRequest request);         // 创建会话（无密码，QuickConnect 用）
Task Logout(string accessToken);                                                      // 按令牌登出
Task RevokeUserTokens(Guid userId, string currentAccessToken);                        // 撤销用户所有令牌
Task<SessionInfo> GetSessionByAuthenticationToken(string token, ...);                  // 按令牌查询会话
```

#### IQuickConnect

文件：`MediaBrowser.Controller/QuickConnect/IQuickConnect.cs`

```csharp
bool IsEnabled { get; }
QuickConnectResult TryConnect(AuthorizationInfo authorizationInfo);   // 发起请求
QuickConnectResult CheckRequestStatus(string secret);                 // 轮询状态
Task<bool> AuthorizeRequest(Guid userId, string code);                // 授权请求
AuthenticationResult GetAuthorizedRequest(string secret);             // 获取授权结果
```

### 3.5 实现文件

| 接口 | 实现类 | 文件路径 |
|------|--------|----------|
| `IUserManager` | `UserManager` | `Jellyfin.Server.Implementations/Users/UserManager.cs` |
| `ISessionManager` | `SessionManager` | `Emby.Server.Implementations/Session/SessionManager.cs` |
| `IQuickConnect` | `QuickConnectManager` | `Emby.Server.Implementations/QuickConnect/QuickConnectManager.cs` |
| `IAuthenticationManager` | `AuthenticationManager` | `Jellyfin.Server.Implementations/Security/AuthenticationManager.cs` |

### 3.6 关键认证流程

#### 流程 A：用户名密码登录

```
前端 login/index.js
  1. 页面加载 → GET /Users/Public（获取公开用户列表显示头像）
  2. 用户填写表单 → POST /Users/AuthenticateByName { Username, Pw }

后端 UserController.AuthenticateUserByName()
  → ISessionManager.AuthenticateNewSession(request)

SessionManager.AuthenticateNewSessionInternal(request, enforcePassword=true)
  → IUserManager.AuthenticateUser(username, password, remoteEndPoint, true)

UserManager.AuthenticateUser()
  → AuthenticateLocalUser()
    → 遍历所有 IAuthenticationProvider
    → 每个 provider.Authenticate(username, password)
    → DefaultAuthenticationProvider 检查哈希密码
  → 成功: 重置 InvalidLoginAttemptCount，更新 LastLoginDate
  → 失败: 递增 InvalidLoginAttemptCount；达阈值则禁用用户

SessionManager（续）
  → 检查设备访问和最大活跃会话数
  → GetAuthorizationToken() — 创建 Device 记录，生成 AccessToken
  → LogSessionActivity() — 创建/更新 SessionInfo
  → 返回 AuthenticationResult { User, SessionInfo, AccessToken, ServerId }

前端
  → 保存 UserId + AccessToken
  → 导航至 /home
```

#### 流程 B：QuickConnect 登录

```
前端 login/index.js
  1. 用户点击 "Quick Connect" → POST /QuickConnect/Initiate
  2. 后端生成 32 字节 Secret + 6 位数字 Code
  3. 前端显示 Code，每 5 秒轮询: GET /QuickConnect/Connect?secret=...

另一已认证客户端
  4. 用户在已登录设备输入 Code
  5. POST /QuickConnect/Authorize?code=CODE
  6. 后端调用 SessionManager.AuthenticateDirect()（无密码验证）
  7. 存储 AuthenticationResult

前端轮询到 Authenticated=true
  8. POST /Users/AuthenticateWithQuickConnect { Secret }
  9. 后端返回预创建的 AuthenticationResult
  10. 前端保存令牌，导航至 /home
```

#### 流程 C：路由守卫（ConnectionRequired）

```
每个路由包裹在 <ConnectionRequired level="user|public|admin|wizard">

1. 挂载时调用 ServerConnections.connect() 检查连接状态
2. 状态处理:
   - SignedIn → 公共路由则重定向到 /home
   - ServerSignIn → 重定向到 /login
   - ServerSelection → 重定向到 /selectserver
3. user/admin 路由: 检查 apiClient.isLoggedIn()
4. admin 路由: 额外检查 Policy.IsAdministrator
5. wizard 路由: 检查 StartupWizardCompleted
```

### 3.7 架构要点

1. **插件式认证提供器链**：`UserManager.AuthenticateLocalUser()` 遍历所有注册的 `IAuthenticationProvider` 实例，允许第三方认证（如 LDAP）与内置认证共存。
2. **令牌即设备记录**：AccessToken 对应数据库中的 Device 实体，登出即删除该 Device 记录。
3. **实现分散**：`IUserManager` 在 `Jellyfin.Server.Implementations`，`ISessionManager` 和 `IQuickConnect` 在 `Emby.Server.Implementations`，反映了从 Emby 代码库逐步迁移的过程。

---

## 4. 元数据管理

### 4.1 功能描述

元数据管理模块负责媒体项目的元数据获取、编辑、刷新和图片管理。支持手动编辑元数据字段、从远程提供器（TMDb、IMDb 等）搜索并识别媒体、刷新元数据（扫描/填充/替换）、以及浏览/上传/下载远程图片。

### 4.2 前端路由和页面组件

#### 路由定义

| URL 路径 | 入口 | 说明 |
|----------|------|------|
| `/metadata` | `edititemmetadata` Controller + HTML | 元数据编辑器主页面（Legacy ViewManager 路由） |
| `/dashboard/libraries/metadata` | `dashboard/routes/libraries/metadata.tsx` | 服务端元数据语言设置页面（React） |

#### 关键前端组件

| 组件 | 路径 | 说明 |
|------|------|------|
| edititemmetadata | `controllers/edititemmetadata.js` + `controllers/edititemmetadata.html` | 元数据管理器入口 |
| **metadataEditor** | `components/metadataEditor/metadataEditor.js` | **核心编辑表单** — 名称、简介、类型、标签、人员、ProviderIds 等 |
| **itemidentifier** | `components/itemidentifier/itemidentifier.js` | **识别对话框** — 搜索远程提供器并应用匹配结果 |
| **refreshdialog** | `components/refreshdialog/refreshdialog.js` | **刷新元数据对话框** — 扫描/缺失/全部替换模式 |
| **imageeditor** | `components/imageeditor/imageeditor.js` | **图片编辑器** — 上传/删除/排序/浏览远程图片 |
| itemContextMenu | `components/itemContextMenu.js` | 右键菜单：编辑元数据、识别、刷新、编辑图片 |
| itemHelper | `components/itemHelper.js` | 权限检查：`canIdentify()`、`canEdit()`、`canEditImages()` |

### 4.3 后端 Controller 和 API 端点

#### ItemUpdateController（手动编辑）

文件：`Jellyfin.Api/Controllers/ItemUpdateController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **POST** | **`/Items/{itemId}`** | 更新项目元数据（从编辑器表单提交） |
| GET | `/Items/{itemId}/MetadataEditor` | 获取编辑器配置信息（分级选项、外部 ID 等） |
| POST | `/Items/{itemId}/ContentType` | 更新内容类型分类 |

#### ItemLookupController（远程搜索/识别）

文件：`Jellyfin.Api/Controllers/ItemLookupController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| POST | `/Items/RemoteSearch/Movie` | 搜索远程电影匹配 |
| POST | `/Items/RemoteSearch/Series` | 搜索远程电视剧匹配 |
| POST | `/Items/RemoteSearch/Person` | 搜索远程人物匹配 |
| POST | `/Items/RemoteSearch/MusicAlbum` | 搜索远程音乐专辑匹配 |
| POST | `/Items/RemoteSearch/Book` | 搜索远程书籍匹配 |
| ... | `/Items/RemoteSearch/{Type}` | 每种媒体类型一个端点 |
| **POST** | **`/Items/RemoteSearch/Apply/{itemId}`** | 应用选中的搜索结果 → 设置 ProviderIds → 触发全量刷新 |
| GET | `/Items/{itemId}/ExternalIdInfos` | 获取项目支持的外部 ID 类型 |

#### ItemRefreshController（刷新元数据）

文件：`Jellyfin.Api/Controllers/ItemRefreshController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| **POST** | **`/Items/{itemId}/Refresh`** | 队列式元数据刷新，参数: metadataRefreshMode, imageRefreshMode, replaceAllMetadata, replaceAllImages, regenerateTrickplay |

#### RemoteImageController（远程图片）

文件：`Jellyfin.Api/Controllers/RemoteImageController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Items/{itemId}/RemoteImages` | 浏览远程可用图片 |
| GET | `/Items/{itemId}/RemoteImages/Providers` | 列出远程图片提供器 |
| POST | `/Items/{itemId}/RemoteImages/Download` | 下载远程图片并保存 |

#### ImageController（图片 CRUD）

文件：`Jellyfin.Api/Controllers/ImageController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| POST | `/Items/{itemId}/Images/{imageType}` | 上传图片 |
| DELETE | `/Items/{itemId}/Images/{imageType}/{imageIndex}` | 删除图片 |
| POST | `/Items/{itemId}/Images/{imageType}/{imageIndex}/Index` | 重排图片顺序 |
| GET | `/Items/{itemId}/Images/{imageType}` | 获取/流式传输图片 |
| GET | `/Items/{itemId}/Images` | 列出所有图片信息 |

#### PersonsController

文件：`Jellyfin.Api/Controllers/PersonsController.cs`

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/Persons` | 获取人物列表 |
| GET | `/Persons/{name}` | 按名称获取人物 |

### 4.4 Service 接口

#### IProviderManager

文件：`MediaBrowser.Controller/Providers/IProviderManager.cs`

```csharp
// 刷新操作
void QueueRefresh(Guid itemId, MetadataRefreshOptions options, RefreshPriority priority);
Task RefreshFullItem(BaseItem item, MetadataRefreshOptions options, CancellationToken ct);

// 图片操作
Task SaveImage(BaseItem item, string url, ImageType type, int? imageIndex, CancellationToken ct);
Task<IEnumerable<RemoteImageInfo>> GetAvailableRemoteImages(BaseItem item, RemoteImageQuery query, CancellationToken ct);

// 远程搜索
Task<IEnumerable<RemoteSearchResult>> GetRemoteSearchResults<TItemType, TLookupType>(RemoteSearchQuery<TLookupType> searchInfo, CancellationToken ct);

// 提供器发现
IEnumerable<IMetadataProvider<T>> GetMetadataProviders<T>(BaseItem item, LibraryOptions libraryOptions);
IEnumerable<IImageProvider> GetImageProviders(BaseItem item, ImageRefreshOptions refreshOptions);
IEnumerable<ExternalIdInfo> GetExternalIdInfos(IHasProviderIds item);

// 事件
event EventHandler<GenericEventArgs<BaseItem>> RefreshStarted;
event EventHandler<GenericEventArgs<BaseItem>> RefreshCompleted;
```

#### IMetadataService

文件：`MediaBrowser.Controller/Providers/IMetadataService.cs`

```csharp
bool CanRefresh(BaseItem item);
Task<ItemUpdateType> RefreshMetadata(BaseItem item, MetadataRefreshOptions refreshOptions, CancellationToken ct);
```

### 4.5 实现文件

| 组件 | 文件路径 |
|------|----------|
| ProviderManager（中央协调器） | `MediaBrowser.Providers/Manager/ProviderManager.cs` |
| MetadataService（抽象基类） | `MediaBrowser.Providers/Manager/MetadataService.cs` |
| MovieMetadataService | `MediaBrowser.Providers/Movies/MovieMetadataService.cs` |
| SeriesMetadataService | `MediaBrowser.Providers/TV/SeriesMetadataService.cs` |
| EpisodeMetadataService | `MediaBrowser.Providers/TV/EpisodeMetadataService.cs` |
| PersonMetadataService | `MediaBrowser.Providers/People/PersonMetadataService.cs` |
| AlbumMetadataService | `MediaBrowser.Providers/Music/AlbumMetadataService.cs` |
| ArtistMetadataService | `MediaBrowser.Providers/Music/ArtistMetadataService.cs` |
| ... | 共 26 个具体 MetadataService 子类，每种项目类型一个 |

### 4.6 关键数据流

#### 流程 A：手动编辑元数据

```
前端 metadataEditor.js → onSubmit()
  → apiClient.updateItem(item)
    → POST /Items/{itemId}  (Body = BaseItemDto)

后端 ItemUpdateController.UpdateItem()
  → LibraryManager.UpdatePeople(item, request.People) — 更新人物关联
  → 映射 DTO 字段到 BaseItem（Name, Overview, Genres, Tags, Studios, ProviderIds...）
  → item.OnMetadataChanged()
  → item.UpdateToRepositoryAsync(ItemUpdateType.MetadataEdit) — 持久化到数据库
  → 特殊情况: 如果 Series.DisplayOrder 变更 → 触发全量刷新
```

#### 流程 B：识别（远程搜索 + 应用）

```
前端 itemidentifier.js
  1. 用户输入搜索条件
  2. POST /Items/RemoteSearch/{Type}  { SearchInfo: { Name, Year, ProviderIds } }

后端 ItemLookupController
  → IProviderManager.GetRemoteSearchResults<T, TLookup>(query)
    → 遍历所有 IRemoteSearchProvider<TLookup>
    → 合并/去重结果

前端显示搜索结果，用户选择一个
  3. POST /Items/RemoteSearch/Apply/{itemId}  (Body = RemoteSearchResult)

后端 ItemLookupController.ApplySearchCriteria()
  → item.ProviderIds = searchResult.ProviderIds（覆写外部 ID）
  → IProviderManager.RefreshFullItem(item, { ReplaceAllMetadata=true, ReplaceAllImages=true })
    → MetadataService.RefreshMetadata()（触发完整刷新管线）
```

#### 流程 C：刷新元数据

```
前端 refreshdialog.js → onSubmit()
  → POST /Items/{itemId}/Refresh?metadataRefreshMode=X&imageRefreshMode=Y

后端 ItemRefreshController.RefreshItem()
  → IProviderManager.QueueRefresh(item.Id, options, RefreshPriority.High)
    → 加入优先级队列

ProviderManager 后台处理队列
  → 取出 (itemId, options)
  → item.RefreshMetadata(options)
    → MetadataService.RefreshMetadata()

MetadataService 管线（核心）:
  Step 1: 图片验证 — 扫描文件系统本地图片
  Step 2: 预处理 — 聚合继承的元数据
  Step 3: 本地提供器 — 运行 ILocalMetadataProvider（如 NFO 解析器）
  Step 4: 远程提供器 — 运行 IRemoteMetadataProvider（如 TMDb 插件）
  Step 5: 合并结果 — 尊重锁定字段、替换/填充语义、提供器优先级
  Step 6: 图片提供器 — 运行 IRemoteImageProvider 下载缺失图片
  Step 7: 持久化 — item.UpdateToRepositoryAsync()
  Step 8: 后处理 — 级联刷新子项（如 Series → Seasons → Episodes）
```

### 4.7 架构要点

1. **五层架构**：前端组件 → REST Controller（薄层） → ProviderManager（中央协调器） → MetadataService（管线） → Provider（插件，实际数据获取）。
2. **插件式提供器**：所有实际的元数据获取由 `ILocalMetadataProvider`、`IRemoteMetadataProvider`、`IRemoteImageProvider` 实现完成，通过 `AddParts()` 在启动时注册。
3. **异步队列式刷新**：`QueueRefresh()` 使用优先级队列，后台异步处理，避免阻塞 API 请求。
4. **26 个 MetadataService 子类**：每种项目类型一个子类，提供类型特定的合并逻辑（`MergeData` 覆写）。

---

## 5. SyncPlay 同步播放

### 5.1 功能描述

SyncPlay 允许多个用户同步观看或收听同一媒体。用户创建或加入播放"组"，组内所有成员的播放、暂停、跳转、换集操作同步进行。系统使用**状态机模式**（Idle/Playing/Paused/Waiting 四种状态）和**时间同步逻辑**来保持客户端对齐，支持共享播放队列、随机/循环模式、缓冲协调和基于 Ping 的延迟测量。

### 5.2 关键 Controller 和 Service

**Controller:** `SyncPlayController`（路由前缀 `/SyncPlay`）

核心端点（共 ~22 个）：

| HTTP | 路由 | 说明 |
|------|------|------|
| POST | `/SyncPlay/New` | 创建新组 |
| POST | `/SyncPlay/Join` | 加入组 |
| POST | `/SyncPlay/Leave` | 离开组 |
| GET | `/SyncPlay/List` | 列出可用组 |
| POST | `/SyncPlay/SetNewQueue` | 设置播放队列 |
| POST | `/SyncPlay/Unpause` | 恢复播放 |
| POST | `/SyncPlay/Pause` | 暂停 |
| POST | `/SyncPlay/Seek` | 跳转 |
| POST | `/SyncPlay/Buffering` | 通知缓冲中 |
| POST | `/SyncPlay/Ready` | 通知就绪 |
| POST | `/SyncPlay/NextItem` | 下一项 |
| POST | `/SyncPlay/PreviousItem` | 上一项 |
| POST | `/SyncPlay/Ping` | 更新 Ping |

**服务接口:** `ISyncPlayManager`
- 文件：`MediaBrowser.Controller/SyncPlay/ISyncPlayManager.cs`

### 5.3 关键文件路径

**后端核心实现：**

| 文件 | 说明 |
|------|------|
| `Emby.Server.Implementations/SyncPlay/SyncPlayManager.cs` | 主管理器 |
| `Emby.Server.Implementations/SyncPlay/Group.cs` | 组逻辑 |
| `MediaBrowser.Controller/SyncPlay/GroupStates/IdleGroupState.cs` | 空闲状态 |
| `MediaBrowser.Controller/SyncPlay/GroupStates/PlayingGroupState.cs` | 播放状态 |
| `MediaBrowser.Controller/SyncPlay/GroupStates/PausedGroupState.cs` | 暂停状态 |
| `MediaBrowser.Controller/SyncPlay/GroupStates/WaitingGroupState.cs` | 等待状态 |
| `MediaBrowser.Controller/SyncPlay/PlaybackRequests/` | 14 种请求类型 |
| `MediaBrowser.Controller/SyncPlay/Queue/PlayQueueManager.cs` | 播放队列 |

**前端（插件架构）：**

| 文件 | 说明 |
|------|------|
| `plugins/syncPlay/plugin.ts` | 插件入口 |
| `plugins/syncPlay/core/Manager.js` | SyncPlay 管理器 |
| `plugins/syncPlay/core/Controller.js` | 播放控制器 |
| `plugins/syncPlay/core/PlaybackCore.js` | 播放同步核心 |
| `plugins/syncPlay/core/QueueCore.js` | 队列管理 |
| `plugins/syncPlay/core/timeSync/TimeSyncCore.js` | 时间同步 |
| `plugins/syncPlay/ui/groupSelectionMenu.js` | 组选择菜单 |
| `apps/experimental/components/AppToolbar/SyncPlayButton.tsx` | 工具栏按钮 |

---

## 6. Live TV 直播电视与 DVR

### 6.1 功能描述

Live TV 提供完整的 IPTV/DVR 功能，包括：浏览直播频道、查看电子节目指南（EPG）、管理录制（DVR）、调度一次性和系列录制定时器、管理调谐器主机（HDHomeRun、M3U/IPTV）、配置节目列表提供器（Schedules Direct、XMLTV），以及频道映射。

### 6.2 关键 Controller 和 Service

**Controller:** `LiveTvController`（路由前缀 `/LiveTv`，共 ~34 个端点）

核心端点：

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/LiveTv/Info` | 获取直播服务信息 |
| GET | `/LiveTv/Channels` | 获取频道列表 |
| GET | `/LiveTv/Programs` | 获取 EPG 节目 |
| GET | `/LiveTv/Programs/Recommended` | 推荐节目 |
| GET | `/LiveTv/GuideInfo` | 获取节目指南信息 |
| GET | `/LiveTv/Recordings` | 获取录制列表 |
| POST/DELETE | `/LiveTv/Timers/{timerId}` | 创建/更新/删除定时器 |
| POST/DELETE | `/LiveTv/SeriesTimers/{timerId}` | 系列定时器管理 |
| POST/DELETE | `/LiveTv/TunerHosts` | 调谐器主机管理 |
| POST/DELETE | `/LiveTv/ListingProviders` | 节目列表提供器管理 |
| GET | `/LiveTv/Tuners/Discover` | 发现调谐器设备 |
| POST | `/LiveTv/ChannelMappings` | 设置频道映射 |

**服务接口：**

| 接口 | 文件 | 说明 |
|------|------|------|
| `ILiveTvManager` | `MediaBrowser.Controller/LiveTv/ILiveTvManager.cs` | 主管理器 |
| `IGuideManager` | `MediaBrowser.Controller/LiveTv/IGuideManager.cs` | 节目指南 |
| `ITunerHostManager` | `MediaBrowser.Controller/LiveTv/ITunerHostManager.cs` | 调谐器管理 |
| `IListingsManager` | `MediaBrowser.Controller/LiveTv/IListingsManager.cs` | 节目列表管理 |
| `IRecordingsManager` | `MediaBrowser.Controller/LiveTv/IRecordingsManager.cs` | 录制管理 |

### 6.3 关键文件路径

**后端（独立项目 `Jellyfin.LiveTv`）：**

| 文件 | 说明 |
|------|------|
| `src/Jellyfin.LiveTv/LiveTvManager.cs` | 主管理器 |
| `src/Jellyfin.LiveTv/DefaultLiveTvService.cs` | 默认服务实现 |
| `src/Jellyfin.LiveTv/Guide/GuideManager.cs` | 节目指南 |
| `src/Jellyfin.LiveTv/Listings/ListingsManager.cs` | 节目列表管理 |
| `src/Jellyfin.LiveTv/Listings/SchedulesDirect.cs` | Schedules Direct 提供器 |
| `src/Jellyfin.LiveTv/Listings/XmlTvListingsProvider.cs` | XMLTV 提供器 |
| `src/Jellyfin.LiveTv/Recordings/RecordingsManager.cs` | 录制管理 |
| `src/Jellyfin.LiveTv/Timers/TimerManager.cs` | 定时器管理 |
| `src/Jellyfin.LiveTv/TunerHosts/TunerHostManager.cs` | 调谐器管理 |
| `src/Jellyfin.LiveTv/TunerHosts/HdHomerun/HdHomerunHost.cs` | HDHomeRun 支持 |
| `src/Jellyfin.LiveTv/TunerHosts/M3UTunerHost.cs` | M3U/IPTV 支持 |

**前端：**

| 文件 | 说明 |
|------|------|
| `apps/dashboard/routes/livetv/index.tsx` | Dashboard 设置页 |
| `apps/dashboard/routes/livetv/recordings.tsx` | 录制管理页 |
| `apps/dashboard/features/livetv/components/` | 组件目录 |
| `controllers/livetv/livetvguide.js` | EPG 指南页（Legacy） |
| `controllers/livetv/livetvchannels.js` | 频道列表页 |
| `controllers/livetv/livetvrecordings.js` | 录制页 |
| `controllers/livetv/livetvschedule.js` | 排程页 |

---

## 7. 定时任务

### 7.1 功能描述

定时任务系统提供可扩展的后台任务框架。任务实现 `IScheduledTask` 接口，定义名称、描述、分类、默认触发器和执行逻辑。`TaskManager` 负责调度（基于触发器：时间点、间隔、启动时等）、排队、取消和执行监控。该系统驱动所有周期性服务器维护：库扫描、插件更新、转码清理、数据库优化、字幕下载等。

### 7.2 关键 Controller 和 Service

**Controller:** `ScheduledTasksController`（路由前缀 `/ScheduledTasks`，管理员权限）

| HTTP | 路由 | 说明 |
|------|------|------|
| GET | `/ScheduledTasks` | 获取所有任务 |
| GET | `/ScheduledTasks/{taskId}` | 获取指定任务 |
| POST | `/ScheduledTasks/Running/{taskId}` | 启动任务 |
| DELETE | `/ScheduledTasks/Running/{taskId}` | 停止运行中的任务 |
| POST | `/ScheduledTasks/{taskId}/Triggers` | 更新任务触发器 |

**服务接口：**

| 接口 | 文件 |
|------|------|
| `ITaskManager` | `MediaBrowser.Model/Tasks/ITaskManager.cs` |
| `IScheduledTask` | `MediaBrowser.Model/Tasks/IScheduledTask.cs` |
| `IScheduledTaskWorker` | `MediaBrowser.Model/Tasks/IScheduledTaskWorker.cs` |

### 7.3 关键文件路径

**后端框架：**

| 文件 | 说明 |
|------|------|
| `Emby.Server.Implementations/ScheduledTasks/TaskManager.cs` | 任务管理器 |
| `Emby.Server.Implementations/ScheduledTasks/ScheduledTaskWorker.cs` | 任务 Worker |

**内置任务实现（实现 IScheduledTask 的类）：**

| 文件 | 说明 |
|------|------|
| `ScheduledTasks/Tasks/RefreshMediaLibraryTask.cs` | 媒体库扫描 |
| `ScheduledTasks/Tasks/PluginUpdateTask.cs` | 插件自动更新 |
| `ScheduledTasks/Tasks/PeopleValidationTask.cs` | 人物元数据验证 |
| `ScheduledTasks/Tasks/OptimizeDatabaseTask.cs` | 数据库优化 |
| `ScheduledTasks/Tasks/DeleteTranscodeFileTask.cs` | 转码文件清理 |
| `ScheduledTasks/Tasks/DeleteLogFileTask.cs` | 日志清理 |
| `ScheduledTasks/Tasks/DeleteCacheFileTask.cs` | 缓存清理 |
| `ScheduledTasks/Tasks/ChapterImagesTask.cs` | 章节图片提取 |
| `ScheduledTasks/Tasks/AudioNormalizationTask.cs` | 音频标准化 |
| `MediaBrowser.Providers/Trickplay/TrickplayImagesTask.cs` | Trickplay 图片生成 |
| `MediaBrowser.Providers/MediaInfo/SubtitleScheduledTask.cs` | 字幕自动下载 |
| `src/Jellyfin.LiveTv/Guide/RefreshGuideScheduledTask.cs` | 直播节目指南刷新 |
| ... | 更多任务 |

**前端（React）：**

| 文件 | 说明 |
|------|------|
| `apps/dashboard/routes/tasks/index.tsx` | 任务列表页 |
| `apps/dashboard/routes/tasks/task.tsx` | 任务详情/编辑页 |
| `apps/dashboard/features/tasks/components/Tasks.tsx` | 任务列表组件 |
| `apps/dashboard/features/tasks/components/Task.tsx` | 单个任务组件 |
| `apps/dashboard/features/tasks/components/TaskProgress.tsx` | 进度指示器 |
| `apps/dashboard/features/tasks/components/NewTriggerForm.tsx` | 触发器创建表单 |
| `apps/dashboard/features/tasks/api/useTasks.ts` | 任务列表 Query Hook |
| `apps/dashboard/features/tasks/api/useStartTask.ts` | 启动任务 Mutation |
| `apps/dashboard/features/tasks/api/useStopTask.ts` | 停止任务 Mutation |
| `apps/dashboard/features/tasks/hooks/useLiveTasks.ts` | WebSocket 实时任务状态 |

---

## 8. 备份与恢复

### 8.1 功能描述

备份模块提供 Jellyfin 服务器的完整系统备份和恢复能力。创建包含数据库（EF Core 导出）、配置文件和清单（manifest）的 ZIP 归档。恢复操作通过调度恢复 + 重启服务器来执行。备份引擎有版本控制（当前 v0.2.0），恢复前验证兼容性。

### 8.2 关键 Controller 和 Service

**Controller:** `BackupController`（路由前缀 `/Backup`，管理员权限）

| HTTP | 路由 | 说明 |
|------|------|------|
| POST | `/Backup/Create` | 创建新备份 |
| POST | `/Backup/Restore` | 调度恢复并重启服务器 |
| GET | `/Backup` | 列出所有可用备份 |
| GET | `/Backup/Manifest` | 获取指定备份的 manifest |

**服务接口:** `IBackupService`
- 文件：`MediaBrowser.Controller/SystemBackupService/IBackupService.cs`
- 关键方法：`CreateBackupAsync()`, `EnumerateBackups()`, `GetBackupManifest()`, `ScheduleRestoreAndRestartServer()`

### 8.3 关键文件路径

**后端：**

| 文件 | 说明 |
|------|------|
| `Jellyfin.Server.Implementations/FullSystemBackup/BackupService.cs` | 备份/恢复实现 |
| `Jellyfin.Server.Implementations/FullSystemBackup/BackupManifest.cs` | 内部 manifest 模型 |
| `Jellyfin.Server.Implementations/FullSystemBackup/BackupOptions.cs` | 内部选项模型 |

**前端（React）：**

| 文件 | 说明 |
|------|------|
| `apps/dashboard/routes/backups/index.tsx` | 备份管理页 |
| `apps/dashboard/features/backups/components/Backup.tsx` | 单个备份组件 |
| `apps/dashboard/features/backups/components/CreateBackupForm.tsx` | 创建备份表单 |
| `apps/dashboard/features/backups/components/BackupInfoDialog.tsx` | 备份信息对话框 |
| `apps/dashboard/features/backups/components/BackupProgressDialog.tsx` | 备份进度对话框 |
| `apps/dashboard/features/backups/api/useBackups.ts` | 备份列表 Query Hook |
| `apps/dashboard/features/backups/api/useCreateBackup.ts` | 创建备份 Mutation |
| `apps/dashboard/features/backups/api/useRestoreBackup.ts` | 恢复备份 Mutation |

---

## 模块对比总结

| 维度 | 媒体库管理 | 视频播放 | 用户认证 | 元数据管理 | SyncPlay | Live TV | 定时任务 | 备份 |
|------|-----------|----------|----------|-----------|----------|---------|---------|------|
| 后端项目 | Emby.Server.Impl | MediaBrowser.MediaEncoding | Jellyfin.Server.Impl + Emby.Server.Impl | MediaBrowser.Providers | Emby.Server.Impl | Jellyfin.LiveTv | Emby.Server.Impl | Jellyfin.Server.Impl |
| Controller 数 | 5 | 6 | 4 | 6 | 1 | 1 | 1 | 1 |
| 端点数 | ~30 | ~25 | ~20 | ~25 | ~22 | ~34 | 5 | 4 |
| 前端架构 | React + Legacy 混合 | Legacy (JS+HTML) | Legacy (JS+HTML) | Legacy (JS+HTML) | 插件 (JS) | React + Legacy 混合 | React | React |
| 设计模式 | 双存储 (FS+DB) | 管线式转码 + 状态机 | 插件式提供器链 | 队列 + 管线 | 状态机 + 时间同步 | 服务/管理器分解 | 任务/触发器/Worker | CRUD + ZIP |
| 复杂度 | 中 | 高 | 中 | 高 | 高 | 很高 | 中 | 低 |
