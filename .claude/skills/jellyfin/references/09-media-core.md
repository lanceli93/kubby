# 09 - Jellyfin 媒体核心深度分析

> 本文档深入分析 Jellyfin 最核心的差异化能力：转码决策逻辑、HLS 播放、元数据管理、文件命名解析、以及前后端流媒体协作。

---

## 1. 文件命名解析（Emby.Naming）

### 1.1 模块概览

`Emby.Naming` 是 Jellyfin 从 Emby 继承的文件命名解析库，负责将磁盘上的文件/目录路径转换为结构化的媒体元数据。这是媒体库扫描的第一步——在做任何网络元数据抓取之前，Jellyfin 先通过文件名推断出标题、年份、季/集号等基本信息。

**核心代码位置**: `Emby.Naming/`

### 1.2 NamingOptions：全局命名规则配置中心

`NamingOptions` (`Emby.Naming/Common/NamingOptions.cs`) 是整个命名系统的配置核心，一个超过 900 行的类，包含：

| 配置项 | 用途 | 示例 |
|--------|------|------|
| `VideoFileExtensions` | 支持的视频扩展名列表（55+ 种） | `.mkv`, `.mp4`, `.avi`, `.ts`, `.iso` 等 |
| `AudioFileExtensions` | 支持的音频扩展名列表（80+ 种） | `.flac`, `.mp3`, `.opus`, `.dsf` 等 |
| `SubtitleFileExtensions` | 字幕文件扩展名 | `.srt`, `.ass`, `.sup`, `.vtt` 等 |
| `EpisodeExpressions` | 剧集解析正则表达式（20+ 条） | S01E01, 1x01, Episode 16, 日期格式等 |
| `CleanStrings` | 文件名清理正则 | 去除 `720p`, `BluRay`, `x264` 等标签 |
| `CleanDateTimes` | 年份提取正则 | 从 `Movie.Title.2020.BluRay` 提取 `2020` |
| `VideoExtraRules` | 附加内容识别规则 | trailers, featurettes, deleted scenes 等 |
| `Format3DRules` | 3D 格式识别 | `hsbs`, `htab`, `mvc` 等 |
| `VideoFileStackingRules` | 分片文件堆叠规则 | `cd1/cd2`, `part1/part2`, `disc1/disc2` |
| `MultipleEpisodeExpressions` | 多集识别表达式（10 条） | S01E01-E03, S01E01E02 |
| `StubTypes` | 存根类型识别 | dvd, bluray, hddvd, vhs 等 |

**设计亮点**：所有正则表达式在构造函数中通过 `Compile()` 方法预编译为 `Regex` 对象（使用 `RegexOptions.Compiled | IgnoreCase`），避免运行时重复编译。

### 1.3 视频文件解析流程

`VideoResolver` (`Emby.Naming/Video/VideoResolver.cs`) 是视频文件解析的入口点：

```
文件路径 → VideoResolver.Resolve()
  ├─ 1. 扩展名检查：是否在 VideoFileExtensions 中？
  │     └─ 否 → 检查是否是 Stub 文件（.disc）
  ├─ 2. 3D 格式检测：Format3DParser.Parse() 检查 hsbs/htab/mvc 等标记
  ├─ 3. 附加内容检测：ExtraRuleResolver.GetExtraInfo() 匹配 trailer/sample/featurette 等
  ├─ 4. 文件名解析（parseName=true 时）：
  │     ├─ CleanDateTimeParser.Clean() → 提取年份（如 "Movie.2020" → name="Movie", year=2020）
  │     └─ CleanStringParser.TryClean() → 去除质量标签（720p, BluRay, x264 等）
  └─ 5. 构建 VideoFileInfo 对象
```

**`VideoFileInfo` 数据模型**：

```csharp
public class VideoFileInfo {
    string Path;           // 完整文件路径
    string Name;           // 清理后的标题
    string? Container;     // 容器格式（mkv, mp4...）
    int? Year;             // 年份
    ExtraType? ExtraType;  // 附加内容类型（Trailer, Sample 等）
    bool Is3D;             // 是否 3D
    string? Format3D;      // 3D 格式
    bool IsStub;           // 是否存根文件
    bool IsDirectory;      // 是否目录
}
```

### 1.4 剧集路径解析

剧集解析是最复杂的命名解析场景，涉及三个核心类：

**`EpisodeResolver`** → **`EpisodePathParser`** → 正则匹配

解析流程：

```
文件路径 → EpisodeResolver.Resolve()
  ├─ 1. 扩展名检查 + Stub 检查
  ├─ 2. 3D 格式检测
  ├─ 3. EpisodePathParser.Parse() 核心解析：
  │     ├─ 遍历 EpisodeExpressions（20+ 条正则）
  │     ├─ 根据 isNamed/isOptimistic/supportsAbsoluteNumbers 过滤
  │     ├─ 匹配成功后提取：seasonnumber, epnumber, seriesname
  │     ├─ 防误判保护：季号 200-1927 或 >2500 视为无效（避免 "1920x1080" 被解析为 S1920E1080）
  │     └─ FillAdditional()：如果首次匹配缺少信息，用 MultipleEpisodeExpressions 补充
  └─ 4. 构建 EpisodeInfo
```

**支持的命名格式举例**：

| 格式类型 | 示例 | 匹配方式 |
|----------|------|----------|
| 标准 SxxExx | `foo.S01E01.mkv` | Named 表达式 |
| 数字分隔 | `1x01`, `01x01` | 绝对集号表达式 |
| Episode 关键字 | `Episode 16 - Title.mkv` | Named 表达式 |
| 日期格式 | `show.2020.01.15.mkv` | IsByDate 表达式 |
| 纯数字 | `01.avi` | Optimistic 表达式 |
| 多集 | `S01E01-E03`, `S01E01E02` | MultipleEpisodeExpressions |
| 动漫格式 | `[Group] Series Name [04]` | Anime 风格表达式 |
| 长格式 | `Series Season 1 Episode 5` | Named 表达式 |

**Season 路径解析** (`SeasonPathParser`)：

支持多语言季文件夹名识别：
- 英文: `Season`, `Series`
- 德文: `Staffel`
- 法文: `Saison`
- 意大利文: `Stagione`
- 瑞典文: `Säsong`
- 韩文: `시즌`
- 日文: `シーズン`
- 俄文: `Сезон`
- 西班牙文/葡萄牙文: `Temporada`
- 还有: `S01`, 纯数字, `Specials`, `Extras`

### 1.5 多版本与文件堆叠

**VideoListResolver** 负责将同一目录中的多个视频文件分组：

1. **文件堆叠（Stacking）**: 将分片文件（cd1/cd2, part1/part2, disc1/disc2）合并为一个逻辑视频
2. **多版本分组**: 同名但不同分辨率/编码的文件（如 `Movie - 1080p.mkv` 和 `Movie - 4K.mkv`）合并为一个条目，按分辨率降序排列
3. **附加内容分离**: 识别为 Extra 的文件（trailer, sample 等）独立归类

**多版本判定条件**：
- 文件名必须以所在目录名开头
- 同一年份的视频
- 清理后文件名差异部分为空、以 `-` 开头、或被方括号包裹

### 1.6 附加内容（Extras）识别

通过 `VideoExtraRules` 支持三种匹配方式：

| 匹配类型 | 示例 | 识别为 |
|----------|------|--------|
| **目录名匹配** | `movie/trailers/trailer.mkv` | Trailer |
| **文件名匹配** | `movie/sample.mkv` | Sample |
| **后缀匹配** | `movie-trailer.mkv`, `movie-featurette.mkv` | Trailer, Featurette |

支持的附加内容类型：Trailer, ThemeVideo, ThemeSong, BehindTheScenes, DeletedScene, Interview, Scene, Sample, Short, Featurette, Clip, Unknown/Extra

---

## 2. 元数据提供者管理器（ProviderManager）

### 2.1 架构概览

`ProviderManager` (`MediaBrowser.Providers/Manager/ProviderManager.cs`) 是 Jellyfin 元数据系统的中枢，实现 `IProviderManager` 接口，负责：

- 管理所有元数据提供者的注册与排序
- 协调元数据的抓取、保存和刷新
- 管理图片的下载和缓存
- 实现带优先级的刷新队列

### 2.2 提供者类型体系

ProviderManager 管理六种类型的提供者组件：

```
IImageProvider[]           → 图片提供者（本地/远程）
IMetadataService[]         → 元数据服务（按 Order 排序）
IMetadataProvider[]        → 元数据提供者（本地/远程）
IMetadataSaver[]           → 元数据保存器（NFO, XML 等）
IExternalId[]              → 外部 ID 提供者（IMDB, TMDB, TVDB 等）
IExternalUrlProvider[]     → 外部 URL 提供者
```

**注册流程**（`AddParts` 方法）：

```csharp
public void AddParts(...) {
    _imageProviders = imageProviders.ToArray();
    _metadataServices = metadataServices.OrderBy(i => i.Order).ToArray(); // 按 Order 排序
    _metadataProviders = metadataProviders.ToArray();
    _externalIds = externalIds.OrderBy(i => i.ProviderName).ToArray();
    _externalUrlProviders = externalUrlProviders.OrderBy(i => i.Name).ToArray();
    _savers = metadataSavers.ToArray();
}
```

### 2.3 元数据刷新流程

#### 单项刷新

```
RefreshSingleItem(item, options)
  ├─ 查找适合的 MetadataService：
  │   ├─ 优先查找 CanRefreshPrimary(type) 的服务
  │   └─ 其次查找 CanRefresh(item) 的服务
  └─ 调用 service.RefreshMetadata(item, options, token)
```

#### 提供者排序机制

提供者排序遵循双层排序：

```csharp
providers
    .Where(i => CanRefreshMetadata(i, item, ...))
    .OrderBy(i => {
        // 第一层：用户配置的顺序
        i switch {
            ILocalMetadataProvider  => GetConfiguredOrder(localMetadataReaderOrder, i.Name),
            IRemoteMetadataProvider => GetConfiguredOrder(metadataFetcherOrder, i.Name),
            _ => int.MaxValue
        }
    })
    .ThenBy(GetDefaultOrder);  // 第二层：IHasOrder.Order 或默认 50
```

**可配置的排序维度**：
- `LocalMetadataReaderOrder`：本地元数据读取器顺序（NFO 优先还是其他格式优先）
- `MetadataFetcherOrder`：远程元数据抓取器顺序（TMDB 优先还是 TVDB 优先）
- `ImageFetcherOrder`：图片抓取器顺序

#### 提供者筛选规则

```
CanRefreshMetadata(provider, item):
  1. 如果 item 不支持本地元数据 且 provider 是 ILocalMetadataProvider → 排除
  2. 如果 includeDisabled → 全部包含
  3. 如果 item 已锁定 且 provider 不是 ILocalMetadataProvider/IForcedProvider → 排除
  4. 如果 provider 是 IRemoteMetadataProvider 且未启用 → 排除
  5. 通过 BaseItemManager.IsMetadataFetcherEnabled() 最终判定
```

### 2.4 优先级刷新队列

ProviderManager 实现了带优先级的刷新队列机制：

```csharp
private readonly PriorityQueue<(Guid ItemId, MetadataRefreshOptions), RefreshPriority> _refreshQueue;
```

**队列处理流程**：

```
QueueRefresh(itemId, options, priority)
  ├─ 将刷新请求入队
  ├─ 检查是否已有处理线程运行
  │   └─ 如果没有 → Task.Run(StartProcessingRefreshQueue)
  └─ StartProcessingRefreshQueue():
        ├─ while (_refreshQueue.TryDequeue(...))
        │   ├─ 获取 item
        │   ├─ RefreshSingleItem(item, options)
        │   └─ 通过事件通知进度
        └─ 完成后设置 _isProcessingRefreshQueue = false
```

**事件通知**：
- `RefreshStarted`: 刷新开始
- `RefreshProgress`: 刷新进度（包含百分比）
- `RefreshCompleted`: 刷新完成

### 2.5 图片管理

图片保存采用 `AsyncKeyedLocker` 按 URL 加锁，防止并发下载同一图片：

```
SaveImage(item, url, type, imageIndex)
  ├─ 按 URL 加锁（AsyncKeyedLocker, PoolSize=20）
  ├─ 检查内存缓存（10 秒有效期）
  │   └─ 命中 → 直接从缓存写入
  ├─ HTTP 下载图片
  ├─ Content-Type 检测与容错：
  │   ├─ 空类型 + imagecache URL → 默认 PNG
  │   ├─ application/octet-stream → 从 URL 推断
  │   └─ 非 image/ 开头 → 抛异常
  ├─ 缓存到 MemoryCache
  └─ 通过 ImageSaver 写入磁盘
```

### 2.6 元数据保存策略

`IsSaverEnabledForItem` 实现了精细的保存控制：

1. `saver.IsEnabledFor(item, updateType)` — 保存器自身是否支持该项目
2. 如果库配置了 `MetadataSavers` 列表 → 仅使用列表中的保存器
3. 如果库未配置保存器列表：
   - 检查 `DisabledMetadataSavers` 配置
   - 检查 `IsSaveLocalMetadataEnabled` 设置
   - 特殊情况：手动编辑时，如果本地 NFO 文件已存在，即使关闭了本地保存也会更新

### 2.7 支持的项目类型

ProviderManager 为以下类型提供元数据插件摘要：

Movie, BoxSet, Book, Series, Season, Episode, MusicAlbum, MusicArtist, Audio, AudioBook, Studio, MusicVideo, Video

每种类型的插件摘要包含：
- LocalMetadataProvider（本地元数据读取器）
- MetadataFetcher（远程元数据抓取器）
- MetadataSaver（元数据保存器）
- LocalImageProvider（本地图片提供者）
- ImageFetcher（图片抓取器）
- SubtitleFetcher（字幕抓取器）
- LyricFetcher（歌词抓取器）
- MediaSegmentProvider（媒体分段提供者）

---

## 3. 转码决策逻辑与 FFmpeg 命令构建

### 3.1 核心组件

转码系统由三个核心类构成：

| 类 | 文件 | 职责 |
|----|------|------|
| **EncodingHelper** | `MediaBrowser.Controller/MediaEncoding/EncodingHelper.cs` (7818 行) | 转码决策引擎 + FFmpeg 命令行构建 |
| **TranscodeManager** | `MediaBrowser.MediaEncoding/Transcoding/TranscodeManager.cs` | 转码任务生命周期管理 |
| **MediaEncoder** | `MediaBrowser.MediaEncoding/Encoder/MediaEncoder.cs` | FFmpeg 进程交互 + 能力探测 |

### 3.2 EncodingHelper：转码决策引擎

`EncodingHelper` 是整个转码系统最核心的类（近 8000 行），负责：

#### 编码器选择

```
GetVideoEncoder(state, encodingOptions):
  ├─ 输出编解码器为 "av1" → GetAv1Encoder()
  ├─ 输出编解码器为 "h265/hevc" → GetH265Encoder()
  ├─ 输出编解码器为 "h264" → GetH264Encoder()
  ├─ 输出编解码器为 "mjpeg" → GetMjpegEncoder()
  ├─ 输出编解码器通过正则校验 → 直接使用
  └─ 默认 → "copy"（直接串流）
```

每种编码器的选择逻辑（以 H.264 为例）：

```
GetH264Encoder(state, encodingOptions):
  = GetH26xOrAv1Encoder("libx264", "h264", state, encodingOptions)
    ├─ 仅对 VideoFile 类型启用硬件编码（排除 folder rips）
    ├─ 检查 HardwareAccelerationType 配置
    ├─ 构建硬件编码器名称映射：
    │   ├─ amf           → h264_amf
    │   ├─ nvenc         → h264_nvenc
    │   ├─ qsv           → h264_qsv
    │   ├─ vaapi         → h264_vaapi
    │   ├─ videotoolbox  → h264_videotoolbox
    │   ├─ v4l2m2m       → h264_v4l2m2m
    │   └─ rkmpp         → h264_rkmpp
    ├─ 验证 FFmpeg 是否支持该编码器
    └─ 不支持 → 回退到 libx264（纯软件编码）
```

#### 硬件加速支持矩阵

```
支持的硬件加速方案：
  ├─ VAAPI (Video Acceleration API)     → Linux（Intel/AMD）
  ├─ QSV (Quick Sync Video)            → Intel
  ├─ NVENC/CUDA                        → NVIDIA
  ├─ AMF (Advanced Media Framework)     → AMD
  ├─ VideoToolbox                       → macOS
  ├─ V4L2M2M                          → Linux ARM（树莓派等）
  ├─ RKMPP                             → Rockchip（RK3588 等）
  └─ D3D11VA                           → Windows
```

**VAAPI 支持检测**（精细到驱动级别）：

```csharp
// MediaEncoder 中的设备检测字段
bool _isVaapiDeviceAmd;           // AMD GPU
bool _isVaapiDeviceInteliHD;      // Intel iHD 驱动
bool _isVaapiDeviceInteli965;     // Intel i965 旧驱动
bool _isVaapiDeviceSupportVulkanDrmModifier;
bool _isVaapiDeviceSupportVulkanDrmInterop;
```

**FFmpeg 版本兼容性管理**：

EncodingHelper 维护了大量 FFmpeg 最低版本常量，确保仅在 FFmpeg 支持时才启用特定功能：

```csharp
_minFFmpegImplicitHwaccel = new Version(6, 0);
_minFFmpegHwaUnsafeOutput = new Version(6, 0);
_minFFmpegSvtAv1Params = new Version(5, 1);
_minFFmpegVaapiH26xEncA53CcSei = new Version(6, 0);
_minFFmpegReadrateOption = new Version(5, 0);
_minFFmpegWorkingVtHwSurface = new Version(7, 0, 1);
_minFFmpegAdvancedTonemapMode = new Version(7, 0, 1);
_minFFmpegRkmppHevcDecDoviRpu = new Version(7, 1, 1);
// ...更多版本检查
```

#### 判断 Copy（直接串流）vs Transcode（转码）

```csharp
public static bool IsCopyCodec(string codec)
{
    return string.Equals(codec, "copy", StringComparison.OrdinalIgnoreCase);
}
```

决策链（简化）：

```
客户端设备能力（DeviceProfile）
  ├─ 容器格式兼容？（mp4, mkv, ts...）
  ├─ 视频编解码器兼容？（h264, hevc, av1...）
  ├─ 视频 Profile/Level 兼容？
  ├─ 分辨率/帧率在限制范围内？
  ├─ 音频编解码器兼容？
  └─ 比特率在限制范围内？

  全部 YES → DirectPlay（直接播放）
  部分 YES → DirectStream（仅转封装）或部分转码
  大部分 NO → Transcode（完全转码）
```

#### FFmpeg 命令行构建

**Progressive 模式命令行**：

```
GetProgressiveVideoFullCommandLine():
  "{inputModifier} {inputArgument} {mapArgs} {videoArguments}
   -map_metadata -1 -map_chapters -1 -threads {N}
   {audioArguments} {subtitleArguments} {format} -y {outputPath}"
```

各组成部分：
- `inputModifier`: readrate 限速、protocol 配置等
- `inputArgument`: 输入文件路径或 URL
- `mapArgs`: 流映射（选择哪些音视频字幕轨）
- `videoArguments`: 编码器 + 滤镜链（缩放、色调映射、字幕烧录等）
- `audioArguments`: 音频编解码器 + 声道数 + 采样率
- `format`: 输出格式标志（如 `-f mp4 -movflags frag_keyframe+empty_moov+delay_moov`）

**音频转码通道数限制**：

```csharp
private static readonly Dictionary<string, int> _audioTranscodeChannelLookup = {
    { "libmp3lame", 2 },    // MP3 最多 2 声道
    { "libfdk_aac", 6 },    // FDK AAC 最多 6 声道
    { "ac3", 6 },           // AC3 最多 6 声道
    { "eac3", 6 },          // E-AC3 最多 6 声道
    // AAC, FLAC, ALAC, libopus, libvorbis 支持 8+ 声道
};
```

### 3.3 TranscodeManager：转码任务管理

TranscodeManager 管理转码进程的完整生命周期：

#### 核心数据结构

```csharp
List<TranscodingJob> _activeTranscodingJobs;         // 活跃转码任务列表
AsyncKeyedLocker<string> _transcodingLocks;           // 按路径加锁
```

#### 启动 FFmpeg 进程 (`StartFfMpeg`)

```
StartFfMpeg(state, outputPath, commandLineArguments, ...)
  ├─ 1. 创建输出目录
  ├─ 2. 权限检查：用户是否有视频转码权限
  ├─ 3. 字幕处理：如需烧录字幕，先提取附件字体
  │     ├─ DVD/BluRay → 从 concat 文件提取
  │     └─ 普通文件 → 直接提取
  │     └─ .mks 外部字幕 → 也提取附件
  ├─ 4. 创建 Process 对象
  │     ├─ RedirectStandardError = true（FFmpeg 日志）
  │     ├─ RedirectStandardInput = true（控制信号）
  │     └─ WorkingDirectory 设置
  ├─ 5. 注册 TranscodingJob
  ├─ 6. 启动进程 + 日志记录
  ├─ 7. 等待输出文件创建
  ├─ 8. 启动辅助线程：
  │     ├─ TranscodingThrottler（限速器）
  │     └─ TranscodingSegmentCleaner（分片清理器）
  └─ 9. 返回 TranscodingJob
```

#### 转码限速机制（Throttling）

当满足以下条件时启用限速：

```csharp
static bool EnableThrottling(StreamState state)
    => state.InputProtocol == MediaProtocol.File       // 本地文件
       && state.RunTimeTicks >= 5 minutes               // 至少 5 分钟时长
       && state.IsInputVideo                            // 是视频
       && state.VideoType == VideoType.VideoFile;        // 非 folder rip
```

限速器通过 FFmpeg 的 `pkey`（或旧版的 `ckey`）暂停/恢复机制，防止过快转码浪费资源。

#### 分片清理机制（Segment Cleaning）

HLS 模式下自动清理已播放的分片文件，防止磁盘占用持续增长：

```csharp
static bool EnableSegmentCleaning(StreamState state)
    => state.InputProtocol is File or Http
       && state.IsInputVideo
       && state.TranscodingType == TranscodingJobType.Hls
       && state.RunTimeTicks >= 5 minutes;
```

#### Ping 与超时机制

客户端需要定期 ping 转码任务以保持存活：

```
PingTranscodingJob(playSessionId, isUserPaused):
  ├─ Progressive 超时: 10 秒
  ├─ HLS 超时: 60 秒
  └─ 超时后: OnTranscodeKillTimerStopped() → KillTranscodingJob()
```

#### 日志分类

TranscodeManager 根据转码方式分类日志文件：

```
FFmpeg.Transcode-*  → 视频需要转码
FFmpeg.Remux-*      → 视频和音频都是 copy（仅转封装）
FFmpeg.DirectStream-* → 视频是 copy，音频需要转码
```

### 3.4 MediaEncoder：FFmpeg 进程管理

MediaEncoder 负责 FFmpeg 的发现、验证和能力探测：

**FFmpeg 路径发现优先级**：
1. CLI 参数 / 环境变量
2. `encoding.xml` 配置文件中的 `EncoderAppPath`
3. 系统 `$PATH` 中的 `ffmpeg`

**能力探测**：

```csharp
List<string> _encoders;    // 可用编码器列表
List<string> _decoders;    // 可用解码器列表
List<string> _hwaccels;    // 可用硬件加速列表
List<string> _filters;     // 可用滤镜列表
IDictionary<FilterOptionType, bool> _filtersWithOption;  // 滤镜选项支持
```

**并发控制**：

```csharp
// 图片提取并发限制 = ParallelImageEncodingLimit 或 CPU 核心数
AsyncNonKeyedLocker _thumbnailResourcePool;
// FFmpeg 进程跟踪
List<ProcessWrapper> _runningProcesses;
```

---

## 4. HLS 动态播放列表生成

### 4.1 架构组件

HLS (HTTP Live Streaming) 是 Jellyfin 主要的自适应流媒体传输协议，涉及以下组件：

| 组件 | 位置 | 职责 |
|------|------|------|
| `DynamicHlsController` | `Jellyfin.Api/Controllers/` | HTTP API 端点 |
| `DynamicHlsHelper` | `Jellyfin.Api/Helpers/` | Master 播放列表生成 |
| `DynamicHlsPlaylistGenerator` | `Jellyfin.MediaEncoding.Hls/Playlist/` | VOD 播放列表生成 |
| `IKeyframeExtractor` | `Jellyfin.MediaEncoding.Hls/Extractors/` | 关键帧提取 |
| `CacheDecorator` | `Jellyfin.MediaEncoding.Hls/Cache/` | 关键帧缓存 |
| `HlsSegmentController` | `Jellyfin.Api/Controllers/` | 分片段传输 |

### 4.2 播放列表生成流程

#### Master Playlist（主播放列表）

由 `DynamicHlsHelper.GetMasterHlsPlaylist()` 生成：

```
GetMasterHlsPlaylist(transcodingJobType, streamingRequest, enableAdaptiveBitrate)
  ├─ 解析媒体源信息
  ├─ 确定输出编解码器与参数
  ├─ 生成 master.m3u8（包含不同质量级别的子播放列表引用）
  └─ 返回 HTTP 响应
```

#### VOD Playlist（点播播放列表）

由 `DynamicHlsPlaylistGenerator.CreateMainPlaylist()` 生成：

```
CreateMainPlaylist(request):
  ├─ 1. 确定分片策略：
  │     ├─ 如果是视频 Remux（copy video）→ 基于关键帧分片
  │     │   └─ TryExtractKeyframes() → 尝试从容器元数据提取关键帧
  │     └─ 如果是转码 → 等长分片
  │         └─ ComputeEqualLengthSegments(desiredLengthMs, totalTicks)
  ├─ 2. 确定分片格式：
  │     ├─ .mp4 (fMP4) → HLS Version 7
  │     └─ .ts (MPEG-TS) → HLS Version 3
  ├─ 3. 生成 M3U8 内容：
  │     ├─ #EXTM3U
  │     ├─ #EXT-X-PLAYLIST-TYPE:VOD
  │     ├─ #EXT-X-VERSION: 7 或 3
  │     ├─ #EXT-X-TARGETDURATION: 最大分片长度（向上取整）
  │     ├─ #EXT-X-MEDIA-SEQUENCE:0
  │     ├─ [fMP4] #EXT-X-MAP:URI="prefix-1.mp4?..." (初始化段)
  │     ├─ 循环每个分片：
  │     │   ├─ #EXTINF: 精确到 6 位小数的秒数
  │     │   └─ prefix{index}.ext?runtimeTicks=X&actualSegmentLengthTicks=Y
  │     └─ #EXT-X-ENDLIST
  └─ 4. 返回 M3U8 字符串
```

### 4.3 关键帧提取

分片边界必须对齐关键帧（对于 Remux 模式），Jellyfin 实现了两种关键帧提取器：

| 提取器 | 文件 | 方法 |
|--------|------|------|
| `FfProbeKeyframeExtractor` | 使用 ffprobe 分析 | 通用但较慢 |
| `MatroskaKeyframeExtractor` | 直接解析 MKV Cues 元素 | 快速，仅限 MKV/WebM |

**提取策略**：
- 仅对配置中 `AllowOnDemandMetadataBasedKeyframeExtractionForExtensions` 列出的扩展名启用
- 优先使用基于元数据的提取器（`IsMetadataBased = true`）
- 提取结果包含：`KeyframeTicks[]`（关键帧时间戳数组）和 `TotalDuration`

### 4.4 分片计算算法

#### 基于关键帧的分片（Remux 模式）

```csharp
ComputeSegments(keyframeData, desiredSegmentLengthMs):
  ├─ desiredCutTime = desiredSegmentLengthTicks
  ├─ 遍历所有关键帧：
  │     如果 keyframe >= desiredCutTime:
  │       ├─ 记录当前段长度 = keyframe - lastKeyframe
  │       ├─ lastKeyframe = keyframe
  │       └─ desiredCutTime += desiredSegmentLengthTicks
  └─ 最后一段 = totalDuration - lastKeyframe
```

这种方法确保每个分片都从关键帧开始，播放器可以立即解码而无需等待前一个关键帧。代价是分片长度可能略微不等。

#### 等长分片（转码模式）

```csharp
ComputeEqualLengthSegments(desiredSegmentLengthMs, totalRuntimeTicks):
  ├─ wholeSegments = total / segmentLength
  ├─ remaining = total % segmentLength
  └─ 生成 N 个等长段 + 可能的 1 个余数段
```

转码模式下 FFmpeg 会在分片边界自动插入关键帧，因此可以使用等长分片。

### 4.5 fMP4 vs MPEG-TS

| 特性 | fMP4 (.mp4) | MPEG-TS (.ts) |
|------|-------------|---------------|
| HLS 版本要求 | >= 7 | >= 3 |
| 初始化段 | 需要 `#EXT-X-MAP` | 不需要 |
| 编解码器支持 | H.264/H.265/AV1 + AAC/AC3 | H.264/H.265 + AAC/AC3/MP3 |
| 效率 | 更高（无 188 字节包头开销） | 较低 |
| 兼容性 | 现代浏览器/设备 | 更广泛 |

---

## 5. 前端播放器

### 5.1 播放器插件体系

Jellyfin Web 前端采用插件式播放器架构，位于 `src/plugins/` 目录：

| 播放器 | 文件 | 用途 |
|--------|------|------|
| **htmlVideoPlayer** | `plugins/htmlVideoPlayer/plugin.js` | 主视频播放器（HTML5 `<video>`） |
| **htmlAudioPlayer** | `plugins/htmlAudioPlayer/` | 音频播放器 |
| **chromecastPlayer** | `plugins/chromecastPlayer/` | Chromecast 投屏播放 |
| **sessionPlayer** | `plugins/sessionPlayer/` | 远程会话控制 |
| **bookPlayer** | `plugins/bookPlayer/` | 电子书阅读器 |
| **comicsPlayer** | `plugins/comicsPlayer/` | 漫画阅读器 |
| **pdfPlayer** | `plugins/pdfPlayer/` | PDF 查看器 |
| **photoPlayer** | `plugins/photoPlayer/` | 图片查看器 |
| **youtubePlayer** | `plugins/youtubePlayer/` | YouTube 播放器 |

### 5.2 HtmlVideoPlayer 核心实现

`HtmlVideoPlayer` 类是最关键的播放器插件：

```javascript
export class HtmlVideoPlayer {
    name = 'Html Video Player';
    type = PluginType.MediaPlayer;
    id = 'htmlvideoplayer';
    priority = 1;  // 低优先级，让插件播放器优先
}
```

#### 播放启动流程

```
play(options):
  ├─ 1. 重置状态（started, timeUpdated, currentTime）
  ├─ 2. createMediaElement(options) → 创建/复用 <video> 元素
  ├─ 3. applyAspectRatio() → 设置宽高比
  ├─ 4. updateVideoUrl(options):
  │     └─ Safari/macOS + HLS + Transcode → 预获取 live.m3u8 播放列表
  │        （Safari 不喜欢分片还没准备好就开始播放）
  └─ 5. setCurrentSrc(elem, options) → 设置视频源
```

#### 视频源设置策略 (`setCurrentSrc`)

根据媒体类型和浏览器能力，选择不同的播放方式：

```
setCurrentSrc(elem, options):
  ├─ 销毁之前的 HLS/FLV/Cast 播放器实例
  ├─ 设置字幕轨道索引
  ├─ 选择播放策略：
  │     ├─ FLV 格式 → setSrcWithFlvJs()
  │     │     └─ 使用 flv.js 库，range seek 模式
  │     ├─ HLS 且需要 hls.js → setSrcWithHlsJs()
  │     │     ├─ 高码率(>=25Mbps) + Chrome/Edge/Firefox → maxBufferLength=6s
  │     │     ├─ 其他 → maxBufferLength=30s
  │     │     ├─ 配置 Hls.js：
  │     │     │   ├─ startPosition 基于 playerStartPositionTicks
  │     │     │   ├─ manifestLoadingTimeOut=20000
  │     │     │   ├─ videoPreference: { preferHDR: true }
  │     │     │   └─ CORS credentials 支持
  │     │     └─ hls.loadSource(url) + hls.attachMedia(elem)
  │     └─ 其他 → 原生 HTML5 播放
  │           └─ applySrc(elem, val) + elem.play()
  └─ 设置音频轨道
```

#### hls.js 配置优化

```javascript
const hls = new Hls({
    startPosition: options.playerStartPositionTicks / 10000000,
    manifestLoadingTimeOut: 20000,
    maxBufferLength: maxBufferLength,      // 6s 或 30s
    maxMaxBufferLength: maxBufferLength,
    videoPreference: { preferHDR: true },  // 偏好 HDR
    xhrSetup(xhr) {
        xhr.withCredentials = includeCorsCredentials;  // CORS 凭证
    }
});
```

全局默认配置（初始化时设置）：

```javascript
hls.DefaultConfig.lowLatencyMode = false;        // 禁用低延迟模式
hls.DefaultConfig.backBufferLength = Infinity;    // 无限后向缓冲
hls.DefaultConfig.liveBackBufferLength = 90;      // 直播后向缓冲 90 秒
```

### 5.3 字幕渲染

HtmlVideoPlayer 支持多种字幕格式和渲染方式：

**原生轨道支持判断** (`enableNativeTrackSupport`)：

```
enableNativeTrackSupport(mediaSource, track):
  ├─ Embed 方式 → 支持原生
  ├─ Firefox + HLS → 不支持（已知问题）
  ├─ PS4/webOS/Edge → 不支持
  ├─ iOS < 10 → 不支持
  ├─ SSA/ASS/PGS 格式 → 不支持（需要特殊渲染）
  └─ 其他 → 支持原生
```

**字幕渲染器**：
- `#currentAssRenderer` — ASS/SSA 字幕渲染（通过 WASM 库）
- `#currentPgsRenderer` — PGS 图形字幕渲染
- 原生 `<track>` 元素 — VTT/SRT 等文本字幕

**双字幕支持**：
- `PRIMARY_TEXT_TRACK_INDEX = 0` — 主字幕
- `SECONDARY_TEXT_TRACK_INDEX = 1` — 副字幕
- 独立的 `#videoSubtitlesElem` 和 `#videoSecondarySubtitlesElem`

### 5.4 关键辅助模块

| 模块 | 路径 | 功能 |
|------|------|------|
| `playbackmanager.js` | `components/playback/` | 全局播放管理器（播放控制、队列管理、码率管理） |
| `htmlMediaHelper` | `components/` | HLS/FLV/Cast 生命周期管理、错误处理 |
| `browserDeviceProfile` | `scripts/` | 浏览器设备能力检测，生成 DeviceProfile |
| `playmethodhelper.js` | `plugins/` | 播放方法判断辅助 |
| `playqueuemanager.js` | `plugins/` | 播放队列管理 |
| `skipsegment.ts` | `components/playback/` | 片头/片尾跳过 |
| `syncPlay` | `plugins/syncPlay/` | 多设备同步播放 |

---

## 6. 前后端协作：完整播放链路

### 6.1 播放请求全流程

```
用户点击播放按钮
  │
  ▼
[前端] PlaybackManager.play(item)
  ├─ 1. 获取媒体源信息
  │     POST /Items/{id}/PlaybackInfo
  │     → 返回 MediaSourceInfo[]（包含所有可用版本/流）
  │
  ├─ 2. 设备能力匹配（DeviceProfile）
  │     ├─ browserDeviceProfile.js 生成浏览器能力描述
  │     ├─ 包含：支持的容器、编解码器、分辨率等
  │     └─ 服务器根据 Profile 判断播放方式
  │
  ├─ 3. 确定播放方法（PlayMethod）
  │     ├─ DirectPlay: 客户端直接请求原始文件
  │     ├─ DirectStream: 服务器仅转封装（容器不同但编解码器兼容）
  │     └─ Transcode: 服务器转码后传输
  │
  ▼
[后端] 根据 PlayMethod 处理
  │
  ├─ DirectPlay:
  │   └─ GET /Videos/{id}/stream.{ext}
  │       → 直接返回文件流
  │
  ├─ DirectStream/Transcode + HLS:
  │   ├─ GET /Videos/{id}/master.m3u8
  │   │   → DynamicHlsHelper.GetMasterHlsPlaylist()
  │   │   → 返回主播放列表（包含不同质量的子列表）
  │   │
  │   ├─ GET /Videos/{id}/main.m3u8
  │   │   → DynamicHlsPlaylistGenerator.CreateMainPlaylist()
  │   │   → 返回 VOD 播放列表（所有分片列表）
  │   │
  │   └─ GET /Videos/{id}/{index}.ts 或 .mp4
  │       ├─ 如果分片已缓存 → 直接返回
  │       └─ 如果需要转码：
  │           ├─ TranscodeManager.StartFfMpeg()
  │           │   ├─ EncodingHelper 构建 FFmpeg 命令行
  │           │   ├─ 启动 FFmpeg 进程
  │           │   ├─ 启动 Throttler + SegmentCleaner
  │           │   └─ 等待目标分片文件生成
  │           └─ 返回分片内容
  │
  ▼
[前端] 播放器接收并播放
  ├─ HLS 模式:
  │   ├─ hls.js 解析 m3u8 → 按需请求分片
  │   ├─ 缓冲管理（maxBufferLength 自适应）
  │   └─ 错误恢复（handleHlsJsMediaError）
  │
  ├─ 字幕渲染:
  │   ├─ 服务端烧录（Encode delivery）→ 已嵌入视频流
  │   ├─ 外部加载（External delivery）→ 额外 HTTP 请求
  │   └─ 内嵌提取（HLS embed）→ hls.js 自动处理
  │
  └─ 定期汇报:
      ├─ POST /Sessions/Playing（开始播放）
      ├─ POST /Sessions/Playing/Progress（进度更新）
      │   → 触发 TranscodeManager 的 Ping 保活
      └─ POST /Sessions/Playing/Stopped（停止播放）
          → 触发转码任务清理
```

### 6.2 播放状态保持与恢复

**心跳机制**：

```
前端 PlaybackManager:
  ├─ 定期发送 PlaybackProgress 报告
  │   └─ 包含：PositionTicks, IsPaused, PlayMethod, MediaSourceId
  │
后端 TranscodeManager:
  ├─ 收到 Progress → PingTranscodingJob()
  │   ├─ 更新 LastPingDate
  │   ├─ HLS 模式: 60 秒超时
  │   └─ Progressive 模式: 10 秒超时
  └─ 超时未收到 Ping → KillTranscodingJob()
```

**暂停感知**：

当用户暂停播放时，前端通过 `isUserPaused` 参数通知后端，TranscodingThrottler 可以暂停 FFmpeg 转码（通过 stdin 发送 pkey/ckey 信号），节省 CPU 资源。

### 6.3 码率自适应

**前端码率控制**：

```javascript
// HLS 缓冲策略
if (bitrate >= 25000000) {  // ≥ 25 Mbps
    maxBufferLength = 6;     // 减小缓冲以避免高码率卡顿
} else {
    maxBufferLength = 30;    // 正常缓冲
}
```

**后端码率限制**：

用户/服务器可配置最大流媒体比特率，EncodingHelper 据此调整输出参数。

### 6.4 错误恢复链路

```
播放错误发生
  │
  ├─ hls.js 层面:
  │   ├─ MEDIA_ERROR → handleHlsJsMediaError()
  │   │   └─ 尝试恢复（recoverMediaError）
  │   └─ NETWORK_ERROR → 重试下载分片
  │
  ├─ HTML5 <video> 层面:
  │   └─ onErrorInternal() → 报告 MediaError
  │
  └─ 应用层面:
      └─ PlaybackManager 错误处理
          ├─ 尝试切换到另一个媒体源
          ├─ 降低码率重试
          └─ 向用户显示错误信息
```

### 6.5 数据流全景图

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (Web)                          │
│                                                          │
│  PlaybackManager ──→ HtmlVideoPlayer ──→ <video> 元素    │
│       │                    │                              │
│       │              hls.js / flv.js                      │
│       │                    │                              │
│  DeviceProfile ──→  HTTP 请求 ←──  字幕渲染器              │
└───────│──────────────│──────────────────────────────────┘
        │              │
        ▼              ▼
┌───────────────────────────────────────────────────────────┐
│                     后端 (Server)                          │
│                                                            │
│  DynamicHlsController ──→ DynamicHlsHelper                 │
│       │                        │                           │
│       │              DynamicHlsPlaylistGenerator            │
│       │                   │          │                     │
│       │            关键帧提取器    分片计算                   │
│       │                                                    │
│       ▼                                                    │
│  TranscodeManager ──→ EncodingHelper ──→ FFmpeg 进程        │
│       │                    │                               │
│  Throttler +          命令行构建                             │
│  SegmentCleaner       硬件加速选择                           │
│                       滤镜链配置                             │
│                                                            │
│  ProviderManager ──→ MetadataProviders ──→ TMDB/TVDB/...   │
│       │                                                    │
│  Emby.Naming ──→ 文件名解析 ──→ 媒体库结构                   │
└───────────────────────────────────────────────────────────┘
```

---

## 总结

Jellyfin 的媒体核心能力体现了一个成熟的开源媒体服务器需要解决的五大核心挑战：

1. **文件命名解析**：通过 20+ 条正则表达式和灵活的配置系统，覆盖全球各种命名习惯
2. **元数据管理**：插件化的提供者体系 + 优先级队列，支持多来源元数据的智能聚合
3. **转码决策**：近 8000 行的 EncodingHelper 覆盖了 8 种硬件加速方案，精确到 FFmpeg 版本级别的兼容性管理
4. **HLS 流媒体**：基于关键帧感知的智能分片 + fMP4/MPEG-TS 双格式支持
5. **前后端协作**：心跳保活、暂停感知、码率自适应、错误恢复的完整播放状态管理
