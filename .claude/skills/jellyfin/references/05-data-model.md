# 05 - Jellyfin 数据模型与数据库分析

## 1. 数据库技术选型

### 1.1 ORM 框架

Jellyfin 使用 **Entity Framework Core (EF Core)** 作为 ORM 框架，采用 Code-First 模式管理数据库 schema。

| 技术项 | 选型 |
|--------|------|
| ORM | Entity Framework Core |
| 默认数据库引擎 | SQLite（`jellyfin.db`） |
| 连接库 | `Microsoft.Data.Sqlite` |
| 配置方式 | Fluent API（`IEntityTypeConfiguration<T>`） |
| 迁移方式 | EF Core Migrations + 自定义应用级迁移 |
| 并发控制 | `IHasConcurrencyToken`（乐观并发，RowVersion 自增） |

### 1.2 数据库 Provider 架构

Jellyfin 设计了可插拔的数据库 Provider 体系，通过 `IJellyfinDatabaseProvider` 接口实现多数据库支持：

```
IJellyfinDatabaseProvider（接口）
├── Initialise()          — 配置 DbContextOptions
├── OnModelCreating()     — 数据库特定的模型配置
├── ConfigureConventions() — 约定配置
├── RunScheduledOptimisation() — 定期优化（VACUUM 等）
├── RunShutdownTask()     — 关机时的清理
├── MigrationBackupFast() — 迁移前快速备份
├── RestoreBackupFast()   — 快速恢复备份
└── PurgeDatabase()       — 清空数据
```

默认实现为 `SqliteDatabaseProvider`，数据库文件路径为 `{DataPath}/jellyfin.db`。

### 1.3 SQLite 配置细节

`SqliteDatabaseProvider` 中的关键 SQLite 配置：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| Pooling | `true` | 连接池 |
| Command Timeout | 30s | 命令超时 |
| Locking Mode | `NORMAL` | 锁模式 |
| Journal Size Limit | 128MB | WAL 日志大小限制 |
| Temp Store Mode | `2`（MEMORY） | 临时表存储在内存 |
| Sync Mode | `1`（NORMAL） | 同步模式 |

通过 `PragmaConnectionInterceptor` 在每次打开连接时执行 PRAGMA 语句设置这些参数。

### 1.4 DbContext 设计

`JellyfinDbContext` 通过主构造函数注入依赖：

```csharp
public class JellyfinDbContext(
    DbContextOptions<JellyfinDbContext> options,
    ILogger<JellyfinDbContext> logger,
    IJellyfinDatabaseProvider jellyfinDatabaseProvider,
    IEntityFrameworkCoreLockingBehavior entityFrameworkCoreLocking
) : DbContext(options)
```

关键设计：
- **并发令牌处理**：`SaveChanges` 和 `SaveChangesAsync` 中自动调用 `HandleConcurrencyToken()`，对所有实现 `IHasConcurrencyToken` 的已修改实体自增 `RowVersion`
- **锁行为抽象**：通过 `IEntityFrameworkCoreLockingBehavior` 在保存时注入锁定策略（SQLite 需要序列化写入）
- **模型配置加载**：`OnModelCreating` 中调用 `ApplyConfigurationsFromAssembly`，自动发现并应用同程序集内所有 `IEntityTypeConfiguration<T>` 实现

---

## 2. 核心实体清单

### 2.1 活跃 DbSet（当前使用的实体）

| 实体类 | DbSet 名称 | 一句话描述 |
|--------|-----------|-----------|
| `User` | `Users` | 用户账户，含认证信息、偏好设置 |
| `Permission` | `Permissions` | 用户权限（枚举式，如 IsAdministrator、EnableMediaPlayback） |
| `Preference` | `Preferences` | 用户偏好键值对（如已启用的频道、媒体文件夹） |
| `AccessSchedule` | `AccessSchedules` | 用户访问时间表（限制登录时段） |
| `DisplayPreferences` | `DisplayPreferences` | 显示偏好（视图方向、快进长度、Chromecast 版本等） |
| `ItemDisplayPreferences` | `ItemDisplayPreferences` | 单个媒体项的显示偏好 |
| `CustomItemDisplayPreferences` | `CustomItemDisplayPreferences` | 自定义项目显示偏好 |
| `ImageInfo` | `ImageInfos` | 用户头像图片信息 |
| `ActivityLog` | `ActivityLogs` | 活动日志（登录、播放等操作记录） |
| `ApiKey` | `ApiKeys` | API 密钥（第三方应用访问凭证） |
| `Device` | `Devices` | 已注册设备（含访问令牌、应用信息） |
| `DeviceOptions` | `DeviceOptions` | 设备选项配置 |
| `BaseItemEntity` | `BaseItems` | **核心实体**：所有媒体项的统一存储表 |
| `AncestorId` | `AncestorIds` | 媒体项的祖先关系（父子层级） |
| `Chapter` | `Chapters` | 视频章节信息 |
| `MediaStreamInfo` | `MediaStreamInfos` | 媒体流信息（音频轨、视频轨、字幕轨） |
| `AttachmentStreamInfo` | `AttachmentStreamInfos` | 附件流（字体等嵌入资源） |
| `ItemValue` | `ItemValues` | 可复用的值实体（艺术家、流派、标签、工作室） |
| `ItemValueMap` | `ItemValuesMap` | BaseItem 与 ItemValue 的多对多映射表 |
| `People` | `Peoples` | 人物实体（演员、导演等） |
| `PeopleBaseItemMap` | `PeopleBaseItemMap` | 人物与媒体项的多对多映射表（含角色名） |
| `BaseItemProvider` | `BaseItemProviders` | 外部 Provider ID（TMDB、IMDB、TVDB 等） |
| `BaseItemImageInfo` | `BaseItemImageInfos` | 媒体项的图片信息 |
| `BaseItemMetadataField` | `BaseItemMetadataFields` | 被锁定的元数据字段 |
| `BaseItemTrailerType` | `BaseItemTrailerTypes` | 预告片类型 |
| `UserData` | `UserData` | 用户与媒体项的交互数据（播放进度、收藏、评分） |
| `TrickplayInfo` | `TrickplayInfos` | Trickplay 缩略图元数据（用于进度条预览） |
| `MediaSegment` | `MediaSegments` | 媒体段标记（片头、片尾、广告等） |
| `KeyframeData` | `KeyframeData` | 关键帧数据 |

### 2.2 已注释/预留的实体（Libraries 目录）

`Entities/Libraries/` 目录下存在一套完整但**已注释掉**的实体模型，属于早期设计的细粒度媒体库模型。这些实体在 DbContext 中被注释，当前未使用：

| 实体类 | 描述 |
|--------|------|
| `Library` | 媒体库 |
| `LibraryItem` | 库中的项目 |
| `Movie` / `MovieMetadata` | 电影及元数据 |
| `Series` / `SeriesMetadata` | 剧集系列及元数据 |
| `Season` / `SeasonMetadata` | 季及元数据 |
| `Episode` / `EpisodeMetadata` | 集及元数据 |
| `Book` / `BookMetadata` | 书籍及元数据 |
| `Track` / `TrackMetadata` | 音轨及元数据 |
| `MusicAlbum` / `MusicAlbumMetadata` | 音乐专辑及元数据 |
| `Photo` / `PhotoMetadata` | 照片及元数据 |
| `CustomItem` / `CustomItemMetadata` | 自定义项及元数据 |
| `Collection` / `CollectionItem` | 合集 |
| `Company` / `CompanyMetadata` | 公司 |
| `Person` / `PersonRole` | 人物及角色 |
| `Genre` | 流派 |
| `Artwork` | 美术资源 |
| `Rating` / `RatingSource` | 评分 |
| `Release` | 发行版本 |
| `MediaFile` / `MediaFileStream` | 媒体文件及流 |
| `MetadataProvider` / `MetadataProviderId` | 元数据提供者 |

> **设计说明**：当前 Jellyfin 实际采用的是 **"单表继承"（Single Table Inheritance）** 思路，所有媒体类型（电影、剧集、音乐等）都存储在 `BaseItemEntity` 一张表中，通过 `Type` 字段区分类型。Libraries 目录下的细粒度模型代表了一种可能的未来演进方向。

---

## 3. 实体关系图（ER）

### 3.1 核心关系总览

```
User (1) ──────< (N) Permission          用户拥有多个权限
User (1) ──────< (N) Preference           用户拥有多个偏好
User (1) ──────< (N) AccessSchedule       用户拥有多个访问时间表
User (1) ──────< (N) DisplayPreferences   用户拥有多个显示偏好
User (1) ──────< (N) ItemDisplayPreferences
User (1) ──────< (N) Device               用户拥有多个设备
User (1) ──┬──< (N) UserData              用户对多个媒体项有交互
            │
BaseItemEntity (1) ─┤──< (N) UserData     一个媒体项被多个用户交互
BaseItemEntity (1) ──< (N) MediaStreamInfo 一个媒体项有多个流轨
BaseItemEntity (1) ──< (N) Chapter         一个媒体项有多个章节
BaseItemEntity (1) ──< (N) AttachmentStreamInfo
BaseItemEntity (1) ──< (N) BaseItemProvider    外部 Provider ID
BaseItemEntity (1) ──< (N) BaseItemImageInfo   图片信息
BaseItemEntity (1) ──< (N) BaseItemMetadataField 锁定的元数据字段
BaseItemEntity (1) ──< (N) BaseItemTrailerType   预告片类型
BaseItemEntity (1) ──< (N) KeyframeData        关键帧数据

BaseItemEntity (N) ><──── (N) ItemValue    多对多（通过 ItemValueMap）
BaseItemEntity (N) ><──── (N) People       多对多（通过 PeopleBaseItemMap）
BaseItemEntity (N) ><──── (N) BaseItemEntity（祖先关系，通过 AncestorId）
BaseItemEntity (1) ──────< (N) BaseItemEntity（直接父子，ParentId -> DirectChildren）

MediaSegment (N) ──> (1) BaseItemEntity（通过 ItemId）
TrickplayInfo (N) ──> (1) BaseItemEntity（通过 ItemId）
```

### 3.2 多对多关系详解

#### BaseItemEntity ↔ ItemValue（通过 ItemValueMap）

```
BaseItemEntity          ItemValueMap           ItemValue
┌──────────┐      ┌──────────────────┐    ┌───────────────┐
│ Id (PK)  │──1:N─│ ItemId (FK,PK)   │    │ ItemValueId   │
│ ...      │      │ ItemValueId(FK,PK)│─N:1│ Type (enum)   │
└──────────┘      └──────────────────┘    │ Value         │
                                          │ CleanValue    │
                                          └───────────────┘
```

`ItemValue.Type` 枚举值：
- `Artist` (0) — 艺术家
- `AlbumArtist` (1) — 专辑艺术家
- `Genre` (2) — 流派
- `Studios` (3) — 工作室
- `Tags` (4) — 标签
- `InheritedTags` (6) — 继承标签

#### BaseItemEntity ↔ People（通过 PeopleBaseItemMap）

```
BaseItemEntity       PeopleBaseItemMap         People
┌──────────┐    ┌────────────────────────┐  ┌────────────┐
│ Id (PK)  │─1:N│ ItemId (FK,PK)         │  │ Id (PK)    │
│ ...      │    │ PeopleId (FK,PK)       │N:1│ Name       │
└──────────┘    │ Role (PK, nullable)    │  │ PersonType │
                │ SortOrder              │  └────────────┘
                │ ListOrder              │
                └────────────────────────┘
```

#### BaseItemEntity 祖先层级关系（AncestorId）

```
BaseItemEntity(父)      AncestorId          BaseItemEntity(子)
┌──────────────┐   ┌──────────────────┐  ┌──────────────┐
│ Id (PK)      │─1:N│ ParentItemId(PK)│  │ Id (PK)      │
│ .Children    │   │ ItemId (PK)     │N:1│ .Parents     │
└──────────────┘   └──────────────────┘  └──────────────┘
```

此关系表示**媒体库层级结构**（如：媒体库 → 文件夹 → 系列 → 季 → 集）。与 `ParentId/DirectChildren` 的直接父子关系不同，`AncestorId` 表示完整的祖先链。

---

## 4. 关键实体详细分析

### 4.1 用户相关实体

#### User（用户核心表）

**文件**：`Entities/User.cs`

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `Guid` | 主键 |
| `Username` | `string[255]` | 用户名（唯一索引） |
| `Password` | `string?[65535]` | 密码哈希 |
| `AuthenticationProviderId` | `string[255]` | 认证提供者 ID |
| `PasswordResetProviderId` | `string[255]` | 密码重置提供者 ID |
| `MustUpdatePassword` | `bool` | 是否必须更新密码 |
| `InvalidLoginAttemptCount` | `int` | 无效登录尝试次数 |
| `LoginAttemptsBeforeLockout` | `int?` | 锁定前最大尝试次数 |
| `MaxActiveSessions` | `int` | 最大并发会话数 |
| `LastActivityDate` | `DateTime?` | 最后活动时间 |
| `LastLoginDate` | `DateTime?` | 最后登录时间 |
| `SubtitleMode` | `SubtitlePlaybackMode` | 字幕播放模式 |
| `PlayDefaultAudioTrack` | `bool` | 是否播放默认音轨 |
| `AudioLanguagePreference` | `string?[255]` | 首选音频语言 |
| `SubtitleLanguagePreference` | `string?[255]` | 首选字幕语言 |
| `MaxParentalRatingScore` | `int?` | 最大家长评分 |
| `RemoteClientBitrateLimit` | `int?` | 远程客户端码率限制 |
| `EnableAutoLogin` | `bool` | 自动登录 |
| `SyncPlayAccess` | `SyncPlayUserAccessType` | 同步播放权限级别 |
| `CastReceiverId` | `string?[32]` | Chromecast 接收器 ID |
| `RowVersion` | `uint` | 并发令牌（乐观锁） |
| `InternalId` | `long` | 内部 ID（历史遗留，来自旧库迁移） |

**导航属性**：
- `ProfileImage` → `ImageInfo`（一对一，级联删除）
- `Permissions` → `Permission[]`（一对多，级联删除）
- `Preferences` → `Preference[]`（一对多，级联删除）
- `AccessSchedules` → `AccessSchedule[]`（一对多，级联删除）
- `DisplayPreferences` → `DisplayPreferences[]`（一对多，级联删除）
- `ItemDisplayPreferences` → `ItemDisplayPreferences[]`（一对多，级联删除）

#### Permission（权限）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `int` | 自增主键 |
| `UserId` | `Guid?` | 关联用户 ID |
| `Kind` | `PermissionKind` | 权限类型枚举 |
| `Value` | `bool` | 是否拥有该权限 |
| `RowVersion` | `uint` | 并发令牌 |

`PermissionKind` 包含：`IsAdministrator`、`IsDisabled`、`IsHidden`、`EnableMediaPlayback`、`EnableAudioPlaybackTranscoding`、`EnableVideoPlaybackTranscoding`、`EnableContentDeletion`、`EnableRemoteAccess` 等。

#### Preference（偏好）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `int` | 自增主键 |
| `UserId` | `Guid?` | 关联用户 ID |
| `Kind` | `PreferenceKind` | 偏好类型枚举 |
| `Value` | `string[65535]` | 偏好值（JSON 或逗号分隔列表） |
| `RowVersion` | `uint` | 并发令牌 |

#### Device（设备/会话令牌）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `int` | 自增主键 |
| `UserId` | `Guid` | 关联用户 |
| `AccessToken` | `string` | 访问令牌（GUID 格式，无连字符） |
| `AppName` | `string[64]` | 应用名称 |
| `AppVersion` | `string[32]` | 应用版本 |
| `DeviceName` | `string[64]` | 设备名称 |
| `DeviceId` | `string[256]` | 设备唯一标识 |
| `IsActive` | `bool` | 是否活跃 |
| `DateCreated` | `DateTime` | 创建时间 |
| `DateLastActivity` | `DateTime` | 最后活动时间 |

> `Device` 实体同时承担了**访问令牌（Access Token）** 的角色，每次设备登录时创建一条记录并生成 `AccessToken`。

#### ApiKey（API 密钥）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `int` | 自增主键 |
| `Name` | `string[64]` | 密钥名称 |
| `AccessToken` | `string` | 访问令牌 |
| `DateCreated` | `DateTime` | 创建时间 |
| `DateLastActivity` | `DateTime` | 最后使用时间 |

---

### 4.2 BaseItemEntity（核心媒体项实体）

**文件**：`Entities/BaseItemEntity.cs`

这是 Jellyfin 数据模型中最核心、最庞大的实体，采用**单表继承**模式存储所有类型的媒体项。

#### 标量属性（约 70+ 个）

| 分类 | 字段 | 类型 | 说明 |
|------|------|------|------|
| **标识** | `Id` | `Guid` | 主键 |
| | `Type` | `string` | .NET 类型全名（如 `MediaBrowser.Controller.Entities.Movies.Movie`） |
| | `PresentationUniqueKey` | `string?` | 展示唯一键 |
| | `PrimaryVersionId` | `string?` | 主版本 ID |
| **基础信息** | `Name` | `string?` | 名称 |
| | `CleanName` | `string?` | 清理后的名称（用于排序） |
| | `SortName` | `string?` | 排序名 |
| | `ForcedSortName` | `string?` | 强制排序名 |
| | `OriginalTitle` | `string?` | 原始标题 |
| | `Overview` | `string?` | 概述/剧情简介 |
| | `Tagline` | `string?` | 标语 |
| **路径** | `Path` | `string?` | 文件系统路径 |
| **分类** | `MediaType` | `string?` | 媒体类型（Video、Audio、Photo 等） |
| | `IsMovie` | `bool` | 是否是电影 |
| | `IsSeries` | `bool` | 是否是剧集 |
| | `IsFolder` | `bool` | 是否是文件夹 |
| | `IsVirtualItem` | `bool` | 是否是虚拟项 |
| | `ExtraType` | `BaseItemExtraType?` | 附加类型（特辑、幕后等） |
| **层级关系** | `ParentId` | `Guid?` | 直接父项 ID |
| | `TopParentId` | `Guid?` | 顶级父项 ID（媒体库根） |
| | `SeasonId` | `Guid?` | 所属季 ID |
| | `SeriesId` | `Guid?` | 所属系列 ID |
| **时间** | `DateCreated` | `DateTime?` | 创建时间 |
| | `DateModified` | `DateTime?` | 修改时间 |
| | `PremiereDate` | `DateTime?` | 首映日期 |
| | `StartDate` | `DateTime?` | 开始日期（直播节目） |
| | `EndDate` | `DateTime?` | 结束日期 |
| | `DateLastRefreshed` | `DateTime?` | 最后元数据刷新时间 |
| | `DateLastSaved` | `DateTime?` | 最后保存时间 |
| | `DateLastMediaAdded` | `DateTime?` | 最后添加媒体时间 |
| **剧集信息** | `IndexNumber` | `int?` | 集号 |
| | `ParentIndexNumber` | `int?` | 季号 |
| | `EpisodeTitle` | `string?` | 集标题 |
| | `SeriesName` | `string?` | 系列名 |
| | `SeasonName` | `string?` | 季名 |
| **评分** | `CommunityRating` | `float?` | 社区评分 |
| | `CriticRating` | `float?` | 影评评分 |
| | `OfficialRating` | `string?` | 官方分级（PG-13 等） |
| | `CustomRating` | `string?` | 自定义评分 |
| **家长控制** | `InheritedParentalRatingValue` | `int?` | 继承的家长评级值 |
| | `InheritedParentalRatingSubValue` | `int?` | 家长评级子值 |
| | `UnratedType` | `string?` | 未分级类型 |
| **音乐信息** | `Album` | `string?` | 专辑名 |
| | `Artists` | `string?` | 艺术家（管道符分隔） |
| | `AlbumArtists` | `string?` | 专辑艺术家（管道符分隔） |
| | `LUFS` | `float?` | 响度标准化值 |
| | `NormalizationGain` | `float?` | 归一化增益 |
| **媒体技术** | `RunTimeTicks` | `long?` | 时长（ticks） |
| | `TotalBitrate` | `int?` | 总码率 |
| | `Width` | `int?` | 宽度 |
| | `Height` | `int?` | 高度 |
| | `Size` | `long?` | 文件大小 |
| | `Audio` | `ProgramAudioEntity?` | 音频类型 |
| **管道符分隔字符串** | `Genres` | `string?` | 流派（`\|`分隔） |
| | `Studios` | `string?` | 工作室（`\|`分隔） |
| | `Tags` | `string?` | 标签（`\|`分隔） |
| | `ExtraIds` | `string?` | 附加项 ID（`\|`分隔） |
| | `ProductionLocations` | `string?` | 制作地点（`\|`分隔） |
| **元数据** | `PreferredMetadataLanguage` | `string?` | 首选元数据语言 |
| | `PreferredMetadataCountryCode` | `string?` | 首选元数据国家代码 |
| | `IsLocked` | `bool` | 元数据是否锁定 |
| | `IsInMixedFolder` | `bool` | 是否在混合文件夹中 |
| | `IsRepeat` | `bool` | 是否重播 |
| **外部 ID** | `ExternalId` | `string?` | 外部 ID |
| | `ExternalServiceId` | `string?` | 外部服务 ID |
| | `ExternalSeriesId` | `string?` | 外部系列 ID |
| | `ChannelId` | `Guid?` | 频道 ID |
| **序列化** | `Data` | `string?` | JSON 序列化数据（存储无法映射到列的扩展属性） |
| **其他** | `OwnerId` | `string?` | 所有者 ID |
| | `ShowId` | `string?` | 节目 ID |
| | `SeriesPresentationUniqueKey` | `string?` | 系列展示唯一键 |

#### 导航属性

| 属性 | 目标实体 | 关系类型 |
|------|---------|---------|
| `DirectParent` | `BaseItemEntity` | 多对一（ParentId FK） |
| `DirectChildren` | `BaseItemEntity[]` | 一对多（级联删除） |
| `Parents` | `AncestorId[]` | 一对多（祖先关系） |
| `Children` | `AncestorId[]` | 一对多（后代关系） |
| `Peoples` | `PeopleBaseItemMap[]` | 一对多（→ 多对多 People） |
| `UserData` | `UserData[]` | 一对多 |
| `ItemValues` | `ItemValueMap[]` | 一对多（→ 多对多 ItemValue） |
| `MediaStreams` | `MediaStreamInfo[]` | 一对多 |
| `Chapters` | `Chapter[]` | 一对多 |
| `Provider` | `BaseItemProvider[]` | 一对多 |
| `LockedFields` | `BaseItemMetadataField[]` | 一对多 |
| `TrailerTypes` | `BaseItemTrailerType[]` | 一对多 |
| `Images` | `BaseItemImageInfo[]` | 一对多 |

---

### 4.3 UserData（用户媒体交互数据）

**文件**：`Entities/UserData.cs`

这是连接 User 与 BaseItemEntity 的核心桥梁表，记录每个用户对每个媒体项的交互状态。

| 字段 | 类型 | 说明 |
|------|------|------|
| `ItemId` | `Guid` | 媒体项 ID（复合主键之一） |
| `UserId` | `Guid` | 用户 ID（复合主键之一） |
| `CustomDataKey` | `string` | 自定义数据键（复合主键之一） |
| `Rating` | `double?` | 用户评分（0-10） |
| `PlaybackPositionTicks` | `long` | 播放位置（ticks） |
| `PlayCount` | `int` | 播放次数 |
| `IsFavorite` | `bool` | 是否收藏 |
| `Played` | `bool` | 是否已播放 |
| `LastPlayedDate` | `DateTime?` | 最后播放时间 |
| `AudioStreamIndex` | `int?` | 记住的音频轨索引 |
| `SubtitleStreamIndex` | `int?` | 记住的字幕轨索引 |
| `Likes` | `bool?` | 是否喜欢 |
| `RetentionDate` | `DateTime?` | 关联项被删除的日期 |

**复合主键**：`(ItemId, UserId, CustomDataKey)`

**索引策略**（从 `UserDataConfiguration` 中）：
```csharp
builder.HasIndex(d => new { d.ItemId, d.UserId, d.Played });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.PlaybackPositionTicks });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.IsFavorite });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.LastPlayedDate });
```

> **特殊设计**：当 BaseItem 被删除时，关联的 UserData 不会被直接删除，而是将 `ItemId` 指向一个占位符实体（ID 为 `00000000-0000-0000-0000-000000000001`），并设置 `RetentionDate`。这是通过迁移 `DetachUserDataInsteadOfDelete` 实现的。

---

### 4.4 媒体流与附件实体

#### MediaStreamInfo（媒体流信息）

**文件**：`Entities/MediaStreamInfo.cs`

存储视频/音频文件中每个流轨的详细技术信息，约 45 个属性。

| 核心字段 | 类型 | 说明 |
|---------|------|------|
| `ItemId` | `Guid` | 关联的媒体项 |
| `StreamIndex` | `int` | 流索引 |
| `StreamType` | `MediaStreamTypeEntity` | 流类型（Video/Audio/Subtitle/Data） |
| `Codec` | `string?` | 编解码器 |
| `Language` | `string?` | 语言 |
| `BitRate` | `int?` | 码率 |
| `Channels` | `int?` | 声道数 |
| `SampleRate` | `int?` | 采样率 |
| `Height/Width` | `int?` | 分辨率 |
| `AverageFrameRate` | `float?` | 平均帧率 |
| `BitDepth` | `int?` | 位深 |
| `ColorPrimaries/Space/Transfer` | `string?` | HDR 色彩信息 |
| `DvVersionMajor/Minor/Profile/Level` | `int?` | Dolby Vision 参数 |
| `Hdr10PlusPresentFlag` | `bool?` | HDR10+ 标记 |

#### TrickplayInfo（Trickplay 缩略图元数据）

| 字段 | 类型 | 说明 |
|------|------|------|
| `ItemId` | `Guid` | 关联媒体项 |
| `Width` | `int` | 缩略图宽度 |
| `Height` | `int` | 缩略图高度 |
| `TileWidth` | `int` | 每行缩略图数 |
| `TileHeight` | `int` | 每列缩略图数 |
| `ThumbnailCount` | `int` | 总缩略图数 |
| `Interval` | `int` | 缩略图间隔（毫秒） |
| `Bandwidth` | `int` | 峰值带宽 |

#### MediaSegment（媒体段标记）

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `Guid` | 自增主键 |
| `ItemId` | `Guid` | 关联媒体项 |
| `Type` | `MediaSegmentType` | 段类型（Intro/Outro/Recap/Commercial 等） |
| `StartTicks` | `long` | 起始位置 |
| `EndTicks` | `long` | 结束位置 |
| `SegmentProviderId` | `string` | 提供者 ID |

---

### 4.5 活动与日志实体

#### ActivityLog

| 字段 | 类型 | 说明 |
|------|------|------|
| `Id` | `int` | 自增主键 |
| `Name` | `string[512]` | 活动名称 |
| `Overview` | `string?[512]` | 详细描述 |
| `ShortOverview` | `string?[512]` | 简短描述 |
| `Type` | `string[256]` | 活动类型 |
| `UserId` | `Guid` | 关联用户 |
| `ItemId` | `string?[256]` | 关联项 ID |
| `DateCreated` | `DateTime` | 创建时间（UTC） |
| `LogSeverity` | `LogLevel` | 日志级别 |
| `RowVersion` | `uint` | 并发令牌 |

---

## 5. 域模型 vs DB 实体映射

### 5.1 映射概览

Jellyfin 采用**手动映射**模式（不使用 AutoMapper），所有映射逻辑位于 Repository 层。

```
域模型层                        映射层                          数据库实体层
(MediaBrowser.Controller)       (Repository.Map())              (Jellyfin.Database.Implementations)

BaseItem ←───── Map() ─────→ BaseItemEntity
  ├── Movie                      BaseItemRepository              （单表，Type 字段区分）
  ├── Series
  ├── Episode
  ├── Season
  ├── Audio
  ├── MusicAlbum
  ├── Folder
  ├── Video
  └── ...

PersonInfo ←── Map() ─────→ People + PeopleBaseItemMap
                                 PeopleRepository

MediaStream ←── Map() ────→ MediaStreamInfo
                                 MediaStreamRepository

ChapterInfo ←── Map() ───→ Chapter
                                 ChapterRepository
```

### 5.2 BaseItem 域模型继承层次

域模型层 (`MediaBrowser.Controller.Entities`) 使用丰富的继承体系：

```
BaseItem（抽象基类，约 200+ 属性/方法）
├── Folder
│   ├── CollectionFolder
│   ├── UserRootFolder
│   ├── AggregateFolder
│   ├── UserView
│   └── ...
├── Video
│   ├── Movie
│   └── ...
├── Audio
├── MusicAlbum
├── MusicArtist
├── Series
├── Season
├── Episode
├── Trailer
├── LiveTvChannel
├── LiveTvProgram
├── Photo
├── Book
├── MusicVideo
├── BoxSet
├── Playlist
├── PlaylistsFolder
├── Person
├── Genre
├── Studio
├── Year
└── ...
```

### 5.3 类型别名约定

Repository 中使用 C# `using` 别名区分域模型和 DB 实体：

```csharp
using BaseItemDto = MediaBrowser.Controller.Entities.BaseItem;       // 域模型
using BaseItemEntity = Jellyfin.Database.Implementations.Entities.BaseItemEntity;  // DB 实体
```

### 5.4 核心映射逻辑（BaseItemRepository）

**文件**：`Jellyfin.Server.Implementations/Item/BaseItemRepository.cs`

#### Entity → Domain（反序列化/加载）

```csharp
public static BaseItemDto? DeserializeBaseItem(
    BaseItemEntity baseItemEntity,
    ILogger logger,
    IServerApplicationHost? appHost,
    bool skipDeserialization = false)
{
    // 1. 通过 Type 字符串解析 .NET 类型
    var type = GetType(baseItemEntity.Type);  // ConcurrentDictionary 缓存

    // 2. 如果类型需要反序列化且 Data 不为空，从 JSON 反序列化
    if (TypeRequiresDeserialization(type) && baseItemEntity.Data != null)
        dto = JsonSerializer.Deserialize(baseItemEntity.Data, type);

    // 3. 回退：通过 Activator.CreateInstance 创建空实例
    dto ??= Activator.CreateInstance(type);

    // 4. 覆盖所有 DB 列映射的属性
    Map(baseItemEntity, dto, appHost, logger);
}
```

`Map(entity, dto)` 方法处理约 60 个属性的逐一赋值，包括：
- **管道符分隔字符串 → 数组**：`entity.Genres.Split('|')` → `dto.Genres`
- **接口特定属性**：通过 `is IHasSeries`、`is IHasArtist` 等接口检查
- **子类型特殊处理**：`LiveTvChannel`、`Trailer`、`Video`、`Episode`、`Folder`、`LiveTvProgram`

#### Domain → Entity（序列化/保存）

```csharp
public BaseItemEntity Map(BaseItemDto dto)
{
    var entity = new BaseItemEntity { Id = dto.Id, Type = dto.GetType().FullName };

    // 1. 逐一映射约 60 个标量属性
    entity.Name = dto.Name;
    entity.Genres = string.Join('|', dto.Genres);
    // ...

    // 2. 如果类型需要，序列化为 JSON 存入 Data 列
    if (TypeRequiresDeserialization(dto.GetType()))
        entity.Data = JsonSerializer.Serialize(dto, dto.GetType());

    // 3. 映射子实体集合
    entity.Provider = dto.ProviderIds.Select(...).ToList();
    entity.Images = dto.ImageInfos.Select(...).ToList();
    // ...
}
```

### 5.5 数据存储的特殊模式

#### 管道符分隔存储

数组类型的数据在 DB 中以 `|` 分隔的字符串存储：

| 域模型属性 | DB 列 | 示例值 |
|-----------|-------|--------|
| `dto.Genres` (string[]) | `entity.Genres` (string) | `"Action\|Adventure\|Sci-Fi"` |
| `dto.Studios` (string[]) | `entity.Studios` (string) | `"Marvel Studios\|Disney"` |
| `dto.Tags` (string[]) | `entity.Tags` (string) | `"4K\|HDR\|Atmos"` |
| `dto.Artists` (string[]) | `entity.Artists` (string) | `"Artist1\|Artist2"` |
| `dto.ProductionLocations` (string[]) | `entity.ProductionLocations` (string) | `"United States\|United Kingdom"` |

> **注意**：这与 `ItemValue` 表中的结构化存储是冗余的。`ItemValue` 提供了规范化的多对多查询能力，而管道符字段提供了快速的内联读取。

#### JSON Data 列

对于复杂类型或子类特有的属性（无法映射到 `BaseItemEntity` 的固定列），Jellyfin 将整个域对象序列化为 JSON 存入 `Data` 列：

```csharp
private static bool TypeRequiresDeserialization(Type type)
{
    // 大多数特定子类型需要反序列化以恢复子类特有属性
}
```

加载时，先从 JSON 反序列化恢复完整对象，再用 DB 列的值覆盖。这确保了 DB 列中索引优化过的字段总是最新的。

### 5.6 其他 Repository 的映射

| Repository | 域模型 | DB 实体 | 文件 |
|-----------|--------|---------|------|
| `BaseItemRepository` | `BaseItem` | `BaseItemEntity` | `Jellyfin.Server.Implementations/Item/BaseItemRepository.cs` |
| `PeopleRepository` | `PersonInfo` | `People` + `PeopleBaseItemMap` | `Jellyfin.Server.Implementations/Item/PeopleRepository.cs` |
| `MediaStreamRepository` | `MediaStream` | `MediaStreamInfo` | `Jellyfin.Server.Implementations/Item/MediaStreamRepository.cs` |
| `ChapterRepository` | `ChapterInfo` | `Chapter` | `Jellyfin.Server.Implementations/Item/ChapterRepository.cs` |
| `MediaAttachmentRepository` | `MediaAttachment` | `AttachmentStreamInfo` | `Jellyfin.Server.Implementations/Item/MediaAttachmentRepository.cs` |
| `KeyframeRepository` | `KeyframeData` (model) | `KeyframeData` (entity) | `Jellyfin.Server.Implementations/Item/KeyframeRepository.cs` |

所有 Repository 遵循相同模式：
1. 定义私有或静态的 `Map()` 方法
2. 双向映射（Domain ↔ Entity）
3. 逐属性手动赋值
4. 特殊类型需要格式转换（如 `Enum.TryParse`、`Split/Join`）

---

## 6. EF Core 配置模式

### 6.1 配置文件组织

所有 EF Core Fluent API 配置位于 `ModelConfiguration/` 目录，每个实体对应一个配置类：

```
ModelConfiguration/
├── ActivityLogConfiguration.cs
├── AncestorIdConfiguration.cs
├── ApiKeyConfiguration.cs
├── AttachmentStreamInfoConfiguration.cs
├── BaseItemConfiguration.cs          ← 核心，最复杂
├── BaseItemMetadataFieldConfiguration.cs
├── BaseItemProviderConfiguration.cs
├── BaseItemTrailerTypeConfiguration.cs
├── ChapterConfiguration.cs
├── CustomItemDisplayPreferencesConfiguration.cs
├── DeviceConfiguration.cs
├── DeviceOptionsConfiguration.cs
├── DisplayPreferencesConfiguration.cs
├── ItemValuesConfiguration.cs
├── ItemValuesMapConfiguration.cs
├── KeyframeDataConfiguration.cs
├── MediaStreamInfoConfiguration.cs
├── PeopleBaseItemMapConfiguration.cs
├── PeopleConfiguration.cs
├── PermissionConfiguration.cs
├── PreferenceConfiguration.cs
├── TrickplayInfoConfiguration.cs
├── UserConfiguration.cs
├── UserDataConfiguration.cs
```

通过 `modelBuilder.ApplyConfigurationsFromAssembly()` 自动发现并注册。

### 6.2 索引策略示例

#### BaseItemEntity 的索引（BaseItemConfiguration）

```csharp
// 单列索引
builder.HasIndex(e => e.Path);
builder.HasIndex(e => e.ParentId);
builder.HasIndex(e => e.PresentationUniqueKey);

// 复合索引 - 通用查询
builder.HasIndex(e => new { e.Id, e.Type, e.IsFolder, e.IsVirtualItem });

// 覆盖索引 - TopParentId 查询
builder.HasIndex(e => new { e.TopParentId, e.Id });

// 系列查询优化
builder.HasIndex(e => new { e.Type, e.SeriesPresentationUniqueKey,
                             e.PresentationUniqueKey, e.SortName });

// 系列计数和日期排序
builder.HasIndex(e => new { e.Type, e.SeriesPresentationUniqueKey,
                             e.IsFolder, e.IsVirtualItem });

// 直播节目查询
builder.HasIndex(e => new { e.Type, e.TopParentId, e.StartDate });

// GetItemValues 覆盖索引
builder.HasIndex(e => new { e.Type, e.TopParentId, e.Id });

// 电影推荐
builder.HasIndex(e => new { e.Type, e.TopParentId, e.PresentationUniqueKey });

// 最新项目
builder.HasIndex(e => new { e.Type, e.TopParentId, e.IsVirtualItem,
                             e.PresentationUniqueKey, e.DateCreated });
builder.HasIndex(e => new { e.IsFolder, e.TopParentId, e.IsVirtualItem,
                             e.PresentationUniqueKey, e.DateCreated });

// 继续播放
builder.HasIndex(e => new { e.MediaType, e.TopParentId, e.IsVirtualItem,
                             e.PresentationUniqueKey });
```

#### UserData 索引

```csharp
// 复合主键
builder.HasKey(d => new { d.ItemId, d.UserId, d.CustomDataKey });

// 查询优化索引
builder.HasIndex(d => new { d.ItemId, d.UserId, d.Played });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.PlaybackPositionTicks });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.IsFavorite });
builder.HasIndex(d => new { d.ItemId, d.UserId, d.LastPlayedDate });
```

#### ItemValue 索引

```csharp
builder.HasIndex(e => new { e.Type, e.CleanValue });
builder.HasIndex(e => new { e.Type, e.Value }).IsUnique();  // 唯一约束
```

### 6.3 关系配置示例

#### 级联删除（User → 子实体）

```csharp
// UserConfiguration.cs
builder.HasMany(u => u.Permissions)
    .WithOne()
    .HasForeignKey(p => p.UserId)
    .OnDelete(DeleteBehavior.Cascade);

builder.HasMany(u => u.Preferences)
    .WithOne()
    .HasForeignKey(p => p.UserId)
    .OnDelete(DeleteBehavior.Cascade);

builder.HasOne(u => u.ProfileImage)
    .WithOne()
    .OnDelete(DeleteBehavior.Cascade);
```

#### 双向多对多（AncestorId）

```csharp
// AncestorIdConfiguration.cs
builder.HasKey(e => new { e.ItemId, e.ParentItemId });
builder.HasIndex(e => e.ParentItemId);
builder.HasOne(e => e.ParentItem)
    .WithMany(e => e.Children)
    .HasForeignKey(f => f.ParentItemId);
builder.HasOne(e => e.Item)
    .WithMany(e => e.Parents)
    .HasForeignKey(f => f.ItemId);
```

#### 自引用父子关系

```csharp
// BaseItemConfiguration.cs
builder.HasMany(e => e.DirectChildren)
    .WithOne(e => e.DirectParent)
    .HasForeignKey(e => e.ParentId)
    .OnDelete(DeleteBehavior.Cascade);
```

### 6.4 值转换器

#### DateTimeKind 转换器（SQLite Provider）

```csharp
// SqliteDatabaseProvider.OnModelCreating
modelBuilder.SetDefaultDateTimeKind(DateTimeKind.Utc);
```

`SetDefaultDateTimeKind` 扩展方法为所有 `DateTime` 和 `DateTime?` 属性注册 `DateTimeKindValueConverter`，确保从 SQLite 读取的时间总是带有 UTC Kind 标记。

### 6.5 种子数据

```csharp
// BaseItemConfiguration.cs
builder.HasData(new BaseItemEntity()
{
    Id = Guid.Parse("00000000-0000-0000-0000-000000000001"),
    Type = "PLACEHOLDER",
    Name = "This is a placeholder item for UserData that has been detached from its original item",
});
```

这个占位符实体用于 `DetachUserDataInsteadOfDelete` 迁移策略——当媒体项被删除时，关联的 UserData 不会删除，而是重新指向此占位符。

---

## 7. 迁移策略

### 7.1 双重迁移系统

Jellyfin 同时使用两套迁移机制：

```
┌─────────────────────────────────────────────────────────┐
│                    启动流程                               │
│                                                         │
│  1. EF Core Migrations（Schema DDL）                     │
│     └── 自动应用 Pending Migrations                       │
│         (Jellyfin.Database.Providers.Sqlite/Migrations/) │
│                                                         │
│  2. Jellyfin Code Migrations（应用级数据迁移）              │
│     └── JellyfinMigrationService 按阶段执行               │
│         ├── PreInitialisation  — 启动前配置迁移            │
│         ├── CoreInitialisation — 核心数据迁移              │
│         └── AppInitialisation  — 应用级数据修复            │
│         (Jellyfin.Server/Migrations/)                    │
└─────────────────────────────────────────────────────────┘
```

### 7.2 EF Core 迁移（Schema 级别）

**位置**：`Jellyfin.Database.Providers.Sqlite/Migrations/`

**命名约定**：`{yyyyMMddHHmmss}_{DescriptiveName}.cs`

**总计**：36 个迁移（2020-05 至 2025-09）

#### 演进阶段

| 阶段 | 时间 | 迁移数 | 主要变更 |
|------|------|--------|---------|
| Phase 1：基础表 | 2020-2021 | 9 | ActivityLog、Users、DisplayPreferences、Devices |
| Phase 2：增量添加 | 2022-2023 | 4 | TrickplayInfos、RemoveEasyPassword |
| Phase 3：**库迁移** | 2024-10 | 1 | **LibraryDbMigration** — 将整个媒体库从 `library.db` 迁入 EF Core |
| Phase 4：修复与优化 | 2024-11 ~ 2025-09 | 22 | 大量索引修复、字段调整、关系优化 |

#### 里程碑迁移：LibraryDbMigration（2024-10-20）

这是 Jellyfin 数据库架构的分水岭。此前，媒体库数据存储在独立的 `library.db` SQLite 文件中（通过原始 SQL 访问），用户数据在 EF Core 管理的 `jellyfin.db` 中。此迁移将所有数据统一到 EF Core 管理的单一数据库中，新增了以下核心表：

- `BaseItems` — 所有媒体项
- `MediaStreamInfos` — 媒体流
- `Chapters` — 章节
- `AncestorIds` — 祖先关系
- `ItemValues` / `ItemValuesMap` — 项目值
- `Peoples` / `PeopleBaseItemMap` — 人物
- `BaseItemProviders` — Provider ID
- `BaseItemImageInfos` — 图片信息
- `UserData` — 用户数据
- `AttachmentStreamInfos` — 附件流

### 7.3 应用级迁移（Code Migrations）

**位置**：`Jellyfin.Server/Migrations/`

**基础设施**：
- `JellyfinMigrationAttribute` — 基于 ISO8601 时间戳的排序属性
- `JellyfinMigrationService` — 迁移编排器
- `JellyfinMigrationStageTypes` — 三个执行阶段

**迁移接口**：
- `IAsyncMigrationRoutine` — 异步迁移
- `IDatabaseMigrationRoutine` — 同步数据库迁移

#### 重要的数据迁移例程

| 例程 | 描述 |
|------|------|
| `MigrateLibraryDb` | 从旧 `library.db` 读取数据写入 EF Core 表（与 LibraryDbMigration 配合） |
| `MigrateActivityLogDb` | 迁移活动日志数据 |
| `MigrateAuthenticationDb` | 迁移认证数据 |
| `MigrateDisplayPreferencesDb` | 迁移显示偏好 |
| `MigrateUserDb` | 迁移用户数据 |
| `MigrateLibraryUserData` | 迁移用户-媒体交互数据 |

#### 数据修复例程

| 例程 | 描述 |
|------|------|
| `FixAudioData` | 修复音频数据 |
| `FixDates` | 修复日期格式 |
| `FixPlaylistOwner` | 修复播放列表所有者 |
| `RefreshCleanNames` | 刷新清理后的名称 |
| `RemoveDuplicateExtras` | 删除重复附加项 |

### 7.4 迁移安全机制

SQLite Provider 实现了迁移前的快速备份/恢复机制：

```csharp
// 迁移前备份
var key = await databaseProvider.MigrationBackupFast(cancellationToken);
// → 复制 jellyfin.db 到 SQLiteBackups/{timestamp}_jellyfin.db

// 迁移失败时恢复
await databaseProvider.RestoreBackupFast(key, cancellationToken);

// 迁移成功后删除备份
await databaseProvider.DeleteBackup(key);
```

---

## 8. 总结

### 8.1 架构特点

1. **单表继承模式**：所有媒体类型存储在 `BaseItemEntity` 一张表，通过 `Type` 字段区分，避免了大量 JOIN 但牺牲了一定的数据规范化
2. **双重序列化**：DB 列存储可索引的核心字段，`Data` 列以 JSON 存储完整对象，两者在读取时合并
3. **手动映射**：不使用 AutoMapper，所有 Repository 手写 `Map()` 方法，提供了最大控制力
4. **冗余存储**：管道符分隔字段（如 `Genres`）与 `ItemValue` 多对多关系并存，分别服务于不同查询场景
5. **可插拔数据库**：通过 `IJellyfinDatabaseProvider` 接口支持多数据库引擎，但目前仅有 SQLite 实现
6. **双重迁移体系**：EF Core 负责 schema DDL，自定义迁移系统负责数据级别的迁移和修复

### 8.2 关键文件索引

| 文件/目录 | 说明 |
|----------|------|
| `Jellyfin.Database.Implementations/JellyfinDbContext.cs` | DbContext 定义 |
| `Jellyfin.Database.Implementations/Entities/` | 所有 DB 实体 |
| `Jellyfin.Database.Implementations/ModelConfiguration/` | Fluent API 配置 |
| `Jellyfin.Database.Implementations/IJellyfinDatabaseProvider.cs` | 数据库 Provider 接口 |
| `Jellyfin.Database.Providers.Sqlite/SqliteDatabaseProvider.cs` | SQLite Provider 实现 |
| `Jellyfin.Database.Providers.Sqlite/Migrations/` | EF Core 迁移 |
| `Jellyfin.Server/Migrations/` | 应用级迁移 |
| `Jellyfin.Server.Implementations/Item/BaseItemRepository.cs` | 核心映射逻辑 |
| `MediaBrowser.Controller/Entities/` | 域模型 |
