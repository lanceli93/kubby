# 照片库架构设计（Photos Domain Design）

> 状态：设计定稿，待实现。2026-07-10 讨论产出。
> 已确认的决策：**照片与手机视频合并为同一种库类型**（学 Jellyfin 的 homevideos/photos 合并页）；**v1 范围 = 时间线 + 灯箱 + 视频内嵌播放**（不含相册管理/收藏/搜索/地图）。

## 0. 背景与核心矛盾

Kubby 当前是纯电影服务器：马赛克 hero、Cover Flow 海报墙、演员墙、TMDB 刮削、NFO——全部围绕"可搜到 metadata 的电影"设计。手机照片/视频没有 poster、没有演员、没有评分，两种审美（暗色影院 vs 明亮相册）无法在同一个首页内调和。

**结论：不调和，做域分离（Domain Separation）。** 参考 Jellyfin 的"首页统一、库内视图分化"模式，但走得更彻底：Kubby 从"电影服务器"升级为"多域媒体服务器"。

## 1. 总体架构：域分离

```
┌─────────────────────────────────────────────────────┐
│  顶层导航（域切换）: 🎬 影院  |  📷 照片  | (将来 🎵 音乐) │
├─────────────────────────────────────────────────────┤
│  影院域          │  照片域           │  音乐域(将来)     │
│  现有首页原样保留   │  时间线首页        │  专辑/歌手 tab 页  │
│  海报墙/演员墙     │  灯箱查看器        │  底部常驻播放条    │
│  movies 表       │  photo_items 表   │  music_* 表      │
│  movie scanner   │  photo scanner    │  music scanner   │
├─────────────────────────────────────────────────────┤
│  共享基础设施（不分域）                                  │
│  库管理(media_libraries) / 图片服务(/api/images + sharp) │
│  播放管线(transcode/HLS/playback-decider) / Auth / i18n │
└─────────────────────────────────────────────────────┘
```

原则：
- **每个域**拥有自己的表、自己的 scanner 策略、自己的路由与首页、自己的审美。
- **共享层**只有媒体类型无关的基础设施。
- 将来加音乐 = 复制这个模式加第三个域（见 `docs/music-library-design.md`），顶层导航再加一个入口。**首页不是一个，是每域一个。**

### Jellyfin 调研关键结论（照片相关）

- Jellyfin 首页 = 各库入口 tile（`GET /UserViews`），进库后按 CollectionType 渲染完全不同的页面（电影 `/movies`，照片+家庭视频合并在 `/homevideos` 一个页面）。
- 照片**不走远程刮削**（不在 ProviderManager 的远程刮削类型清单里），由专门的本地 provider（`Emby.Photos`）处理，只靠 EXIF + 文件名 + 文件夹。
- 数据模型是 BaseItemEntity 单表继承（C# 历史包袱）；Kubby 不学这个，改用**每域独立建表**。
- 播放器按 mediaType 分派插件（photoPlayer / htmlVideoPlayer），同一个 playbackManager 编排。

### Kubby 现状盘点（改造面）

| 层 | 现状 | 改造 |
|---|---|---|
| `media_libraries` 表 | ✅ 已有 `type` 字段，enum 含 `"photo"`（`src/lib/db/schema.ts:22-32`） | 解锁即可 |
| 库管理 UI | ✅ 已有类型下拉（`dashboard/libraries/page.tsx`），photo 待解锁 | 小改 |
| 图片服务 | ✅ `/api/images/[...path]` 通用，支持 `?w=` 缩放 + sharp + WebP | 直接复用 |
| 播放决策 | ✅ `playback-decider.ts` 纯格式决策，不认识"电影" | 复用；stream API 需泛化 |
| 扫描器 | ❌ `scanLibrary()` 完全无视 `library.type`，硬编码 NFO/poster/演员（`src/lib/scanner/index.ts:216`） | 按 type 分派策略 |
| movies 表 | ❌ 30+ 字段全是电影专属 | 不动，照片另建表 |
| 首页/导航 | ❌ 单一影院首页，无域概念 | 加域切换，影院首页原样保留 |

## 2. 导航设计

- 顶栏加域切换：`🎬 影院 | 📷 照片`。点击整页切换域，两种审美互不污染。
- **现有影院体验一寸不动**：马赛克 hero、Cover Flow、演员墙全部保留，就是"影院域"的首页。
- **没有 photo 类型的库时，导航上不显示「照片」**——现有用户零感知。
- 域切换记住上次所在域（cookie 或 localStorage），下次打开直接进。

## 3. 数据模型

**照片和视频共用一张 `photo_items` 表**（`isVideo` 标志区分），不碰 movies 及其关联表（`userMovieData`/`movieBookmarks`/ratings 全部零改动、零回归风险）。

```ts
// src/lib/db/schema.ts 新增
photo_items {
  id            text PK
  libraryId     text FK -> media_libraries.id (cascade delete)
  filePath      text NOT NULL UNIQUE     // 绝对路径
  fileName      text NOT NULL
  isVideo       integer(bool) NOT NULL DEFAULT 0
  takenAt       integer(timestamp)       // EXIF DateTimeOriginal 优先，文件 mtime 兜底
  width         integer
  height        integer
  durationSeconds real                   // 仅视频（ffprobe）
  fileSize      integer
  mimeType      text
  cameraMake    text                     // EXIF Make
  cameraModel   text                     // EXIF Model
  gpsLat        real                     // EXIF GPS（v1 只存不用，v2 地图视图）
  gpsLng        real
  orientation   integer                  // EXIF Orientation（缩略图生成时已应用，存档用）
  thumbnailPath text                     // 缩略图相对路径（metadata 目录下）
  previewPath   text                     // 大预览图（仅 HEIC 等浏览器不可显示格式需要）
  exifJson      text                     // 其余 EXIF 兜底（JSON，学 Jellyfin 的 Data 列思路）
  folderPath    text NOT NULL            // 所在文件夹相对库根的路径（v2 相册映射用）
  dateAdded     integer(timestamp) NOT NULL
  dateModified  integer(timestamp)       // 文件 mtime，增量扫描比对用
}
// 索引：libraryId、takenAt DESC（时间线主查询）、folderPath、isVideo
```

> ⚠️ **Schema 双更新铁律**：加表除了 `schema.ts`，必须同步在 `src/lib/db/index.ts` 的 `pending` 迁移数组加 `CREATE TABLE IF NOT EXISTS ...`（+ 索引），否则已有用户的库启动即崩。

设计要点：
- `takenAt` 是时间线的唯一排序键，扫描时就解析好（EXIF `DateTimeOriginal` > `CreateDate` > 文件 mtime），避免查询期做任何 EXIF 工作。
- 要排序/过滤的字段（takenAt、width/height、isVideo）提成真实列；长尾 EXIF 塞 `exifJson`——学 Jellyfin"索引列 + JSON 兜底"的两条腿。
- `photo_albums` 表 v1 不建；v2 做相册时由 `folderPath` 聚合派生即可，无需迁移数据。

## 4. 扫描器：按库类型分派策略

`scanLibrary(libraryId)` 入口按 `library.type` 分派：

```
scanLibrary()
  ├─ type === "movie" → 现有逻辑原样保留（不重构、不冒险）
  └─ type === "photo" → scanPhotoLibrary()（新文件 src/lib/scanner/photo-scanner.ts）
```

`scanPhotoLibrary()` 流程：
1. 递归遍历库目录，收集：
   - 图片：`.jpg .jpeg .png .webp .heic .heif .gif .avif`
   - 视频：`.mp4 .mov .m4v .3gp`（手机视频；不含 mkv——那是电影域的事）
   - 跳过隐藏文件、`@eaDir`、缩略图目录等。
2. **增量比对**：filePath + mtime + size 未变 → 跳过；文件消失 → 删除记录及缩略图。
3. 每个新/变更文件：
   - 图片：`exifr` 抽 EXIF（takenAt/宽高/相机/GPS/orientation）→ sharp 生成缩略图（长边 ~400px WebP，应用 orientation 旋转）→ HEIC/AVIF 额外生成 previewPath（长边 ~2000px WebP）。
   - 视频：ffprobe 取时长/宽高/编码/creation_time → ffmpeg 抽中间帧做缩略图（同样 WebP + 时长角标由前端叠加）。
4. 写 `photo_items`。缩略图存 `paths.ts` 管理的 metadata 目录下（如 `{metadataDir}/photo-thumbs/{libraryId}/{id}.webp`），**绝不写进用户照片原目录**。
5. **没有 NFO、没有刮削、没有演员、没有 TMDB**——照片域的天然属性（Jellyfin 同款结论）。

技术要点：
- **HEIC 是唯一的硬坑**：iPhone 默认格式，浏览器不能显示。方案 = 扫描期 sharp 转 WebP 缩略图 + 预览图，灯箱显示 previewPath，下载原图仍给 HEIC。若 sharp 的 libvips 不带 HEIF 解码（Windows 预编译版本可能缺），fallback 用 ffmpeg 解码 HEIC（ffmpeg 已是项目依赖）。实现时先验证 `sharp('x.heic')` 在打包环境可用。
- EXIF 解析用 `exifr`（快、零依赖、支持 HEIC EXIF）。
- 扫描进度复用现有 scanner 的进度上报机制。
- 并发控制：缩略图生成是 CPU 密集，用小并发池（如 4），别把机器打满。

## 5. 路由与 API

页面（新增，影院域路由不动）：

| 路由 | 内容 |
|---|---|
| `/photos` | 照片域首页 = 时间线（多 photo 库聚合；单库时无感） |
| `/photos/view/[id]` | 灯箱直链（分享/刷新可达；主要交互还是时间线内弹层） |

API：

| 端点 | 说明 |
|---|---|
| `GET /api/photos?cursor=&limit=&libraryId=` | 时间线分页，按 takenAt DESC，**cursor 分页**（上万张，offset 会越翻越慢） |
| `GET /api/photos/[id]` | 单项详情（EXIF 面板用） |
| `GET /api/photos/[id]/thumb` | 缩略图（内部走通用图片服务） |
| `GET /api/photos/[id]/file` | 原图/预览图（灯箱大图；HEIC 时返回 previewPath，`?original=1` 给原件下载） |
| `GET /api/photos/[id]/stream/decide` | 视频播放决策（见 §6） |

## 6. 播放链路（视频项）

- `playback-decider.ts` 直接复用：手机 H.264 MP4 → direct，HEVC MOV/MP4 → 按客户端能力 direct 或 remux/transcode，几乎不耗服务器 CPU。
- 现有 `/api/movies/[id]/stream/decide` 硬编码查 movies 表 + 多光盘逻辑。**做法：为 photo_items 新建平行的 decide/stream 路由，把 decide 的核心逻辑（编码探测 + iOS HEVC 判断）抽成共享函数**，两个路由各自查各自的表——不改动电影路由的行为。
- 灯箱内遇到 `isVideo` 项：内嵌 `<video>`，direct 时直接 file URL，需要转码时走 HLS（复用 transcode-manager）。

## 7. 前端：时间线 + 灯箱

### 时间线（`/photos` 主视图）
- Google Photos 式：**按月分组的 justified 网格**，`takenAt` 倒序。
- **虚拟滚动必做**（上万张是常态）：只渲染视口附近的行；月份标题 sticky。
- 右侧年/月快速滚动条（v1 可先做简版：吸边的时间指示气泡）。
- 视频缩略图叠加时长角标 + ▶ 标记。
- 缩略图用 `photo_items.thumbnailPath` 直出，不做运行时缩放。
- 审美：~~照片域用明亮/中性底色~~ **与影院域共用同一套暗色主题**（用户决定 2026-07-10：保持 Kubby 整体观感一致，用现有 design token：`--background`/`--header`/`text-muted-foreground`/`bg-white/[0.06]` 等）。

### 灯箱（Lightbox）
- 点击缩略图弹出全屏查看：左右方向键/滑动切换、滚轮/双击缩放、Esc 关闭。
- 信息面板（i）：拍摄时间、相机、分辨率、文件大小、文件路径（EXIF 详情来自 `/api/photos/[id]`）。
- 视频项内嵌播放（§6）。
- 预加载相邻 1-2 张大图。

## 8. i18n / 库管理

- 新增 `photos.*` 消息键（en/zh）：时间线、灯箱、扫描相关文案。影院文案不动。
- 库管理 UI 解锁 `photo` 类型选项；photo 库的表单隐藏电影专属选项（scraper、NFO/Jellyfin 兼容、元数据语言），后端建库时 photo 类型强制 `scraperEnabled=false`。

## 9. v1 范围（已确认）

**做**：
1. `photo_items` 表 + 迁移数组
2. photo scanner（EXIF + 缩略图 + HEIC 处理 + 增量）
3. 库管理解锁 photo 类型
4. 顶栏域切换（有 photo 库才显示）
5. `/photos` 时间线（按月分组 + 虚拟滚动 + cursor 分页）
6. 灯箱（缩放/切换/EXIF 面板）
7. 视频内嵌播放（decide 路由 + direct/HLS）

**不做（v2+ backlog）**：相册管理（folderPath 派生）、收藏/心标、搜索、地图视图（GPS 已入库）、人脸识别、重复照片检测、按日/年视图切换、上传。

## 10. 实现顺序建议（供任务拆分）

1. Schema + 迁移（小，先行）
2. photo scanner（最大块，可先 CLI 验证再接 UI）——**先验证 sharp/HEIC 在 Windows 打包环境可用**
3. `/api/photos` 时间线 API（cursor 分页）
4. 域切换导航
5. `/photos` 时间线页
6. 灯箱
7. 视频播放路由 + 灯箱内播放
8. i18n + 库管理解锁 + 文档更新

（按 `docs/multi-model-workflow.md` 的模式拆给 executor：2/5/6 复杂任务用 opus，其余 sonnet。）
