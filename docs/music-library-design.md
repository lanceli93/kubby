# 音乐库架构设计（Music Domain Design）

> 状态：前瞻设计（照片库之后的下一个域），未排期。2026-07-10 基于 Jellyfin 调研产出。
> 前置阅读：`docs/photos-library-design.md` §1 的「域分离」总体架构——音乐是第三个域，照抄同一模式。

## 0. 定位

音乐域 = 顶层导航第三个入口（`🎬 影院 | 📷 照片 | 🎵 音乐`），拥有自己的表、scanner 策略、首页与审美；共享库管理、播放管线、图片服务、auth、i18n。没有 music 库时导航不显示入口。

## 1. Jellyfin 音乐实现调研结论

（来源：jellyfin skill 文档 + Jellyfin 源码核实）

### 1.1 数据模型
- 实体层次：`MusicArtist → MusicAlbum → Audio(曲目)`，全部落在 BaseItemEntity 单表继承里，物理父子用 `ParentId` + `AncestorId` 链。
- **关键设计——聚合靠映射表，不靠磁盘层级**：艺术家/流派聚合走 `ItemValue(Artist/AlbumArtist/Genre) + ItemValueMap` 多对多表。「artist 页面」是从曲目标签派生的**虚拟聚合**，不要求磁盘上真有 `Artist/` 文件夹（MusicArtist 有 `IsAccessedByName` 双模式）。
- 音乐专属字段：`Album`、`Artists`（多值）、`AlbumArtists`（多值）、`LUFS`、`NormalizationGain`、`IndexNumber`(曲目号)、`ParentIndexNumber`(碟号)。
- 收藏/播放进度与视频共用同一张 UserData 表。

### 1.2 Metadata：内嵌标签为主，与视频相反
- **本地为主**：`AudioFileProber` 用 ATL 标签库读 ID3v1/v2、Vorbis、FLAC 标签 → title/album/artist/albumartist/genre/year/track/disc/作曲/ReplayGain/MusicBrainz-ID。**视频靠文件名正则，音乐靠内嵌 tag**，文件名只是兜底。
- **远程刮削**：MusicBrainz（专辑/艺术家 ID、规范名）→ AudioDB（封面、艺术家简介、多语言 overview）补充。
- **封面优先级**：本地文件（`folder.* cover.* albumart.*`）> 内嵌 picture 帧 > 远程（AudioDB / 从子项聚合）。
- 歌词：`ILyricProvider`，支持内嵌 + 外部 `.lrc`/`.txt`。

### 1.3 扫描/命名约定
- 文件夹约定 `Artist/Album/Track`，由 MusicArtistResolver / MusicAlbumResolver 判定；多碟专辑（`CD1/Disc 2`）合并为一张专辑。
- 音频扩展名 80+ 种（`.flac .mp3 .opus .m4a .dsf ...`）。

### 1.4 播放链路
- 与视频同一套三级决策（DirectPlay > DirectStream > Transcode），独立端点 `GET /Audio/{id}/universal`；**默认转码目标 mp3**（http），也可 HLS。
- **音量归一化**（照抄价值最高的一块）：定时任务用 `ffmpeg -af ebur128` 算**曲目级 + 专辑级** LUFS 存库；DTO 下发 `normalizationGain = -18 - LUFS`（ReplayGain 2.0 参考）；**客户端应用增益**，不烤进转码流。曲目自带 ReplayGain 标签则直接采用。
- Gapless 无缝播放：Jellyfin **没有实现**（源码确认）。可选加分项，非必须。

### 1.5 前端
- `/music` 按 tab 组织：专辑/歌手/歌曲/流派/收藏/播放列表。
- **底部常驻 nowPlayingBar（mini player）**：跨页面导航音乐不断。实现关键 = 播放由**独立于路由的全局 playbackManager 单例**驱动，`<audio>` 元素不随页面卸载销毁；配 PlayQueueManager 管队列/随机/循环。

### 1.6 播放列表
- Playlist 是 Folder 子类（也是 BaseItem）：`OwnerUserId` + `OpenAccess` + `Shares`（私有/公开/共享），条目用有序链接引用（LinkedChildren）持久化；可导出 `.m3u/.m3u8` 文件。收藏无单独实体，走 UserData.IsFavorite。

## 2. Kubby 音乐域建议实现

### 2.1 数据模型（独立建表，不碰 movies/photo_items）

```ts
music_artists {
  id, name UNIQUE, sortName, imagePath, overview,
  musicbrainzId, dateAdded
}
music_albums {
  id, libraryId FK, title, sortTitle, year,
  coverPath,                 // 扫描期解出的封面（本地文件/内嵌帧提取）
  folderPath,                // 专辑目录
  musicbrainzId, dateAdded
}
music_album_artists {        // 多对多：一张专辑多个 AlbumArtist 很常见
  albumId FK, artistId FK, PK(albumId, artistId)
}
music_tracks {
  id, libraryId FK, albumId FK,
  filePath UNIQUE, title, sortTitle,
  trackNumber, discNumber, durationSeconds,
  codec, bitrate, sampleRate, fileSize,
  lufs REAL, replayGain REAL,   // 归一化（§2.4）
  lyricsPath,                    // 外部 .lrc；内嵌歌词抽到 metadata 目录
  dateAdded, dateModified
}
music_track_artists {        // 曲目级 artists（与专辑 AlbumArtist 区分）
  trackId FK, artistId FK, PK(trackId, artistId)
}
```

要点（吸收 Jellyfin 教训）：
- **聚合靠映射表**：artist 页面 = 从 `music_*_artists` 映射表聚合，**绝不**把艺术家绑成物理文件夹。合集/群星专辑（Various Artists）天然可解。
- 曲目→专辑用外键；专辑→艺术家用映射表。
- genre 可先用 text 列（管道分隔）+ 将来需要时再规范化——Jellyfin 就是"内联列 + 映射表"两套并存，Kubby 单机 SQLite 规模先内联列即可。
- ⚠️ 同样遵守 **schema 双更新铁律**（`schema.ts` + `db/index.ts` pending 数组 `CREATE TABLE IF NOT EXISTS`）。

### 2.2 Scanner 策略（`type === "music"` 分派）

1. 递归收音频文件（`.mp3 .flac .m4a .aac .ogg .opus .wav`）。
2. **标签优先**：用 `music-metadata`（npm，纯 JS，支持 ID3/Vorbis/FLAC/M4A）读 title/album/artist/albumartist/track/disc/year/genre/内嵌封面/ReplayGain。文件夹结构（`Artist/Album/`）只作标签缺失时的兜底推断。
3. 专辑归组：按 `albumartist + album` 标签归组（非按文件夹），多碟目录自然合并。
4. 封面：专辑目录 `cover.* folder.*` > 内嵌 picture 帧（抽出存 metadata 目录）> 无。
5. 远程刮削（可选，v2）：MusicBrainz 补规范化 ID + Cover Art Archive 补图，复用现有 scraper 管线的开关模式（`scraperEnabled`）。
6. 增量扫描比对 mtime+size，同 photo scanner。

### 2.3 播放：全局播放单例 + 底部常驻播放条

**这是音乐域最大的前端架构改动点**，照片/电影都没有这个需求：
- 播放状态（当前曲目、队列、进度、随机/循环）放 **app 级 store（Zustand）+ 常驻 `<audio>` 组件**，挂在域布局之外的根 layout，**绝不随路由挂载/卸载**——跨页导航音乐不断。
- 底部 mini-player：封面缩略图 + 标题/艺术家 + 播放控制 + 进度条，点击展开全屏 Now Playing。
- 播放队列管理（下一首/上一首/随机/循环/插队）归这个单例管。
- 电影的"进详情页才播放"模型对音乐不适用。

### 2.4 播放决策与音量归一化

- 决策：绝大多数格式浏览器 `<audio>` 直接播（mp3/aac/flac/ogg/opus in Chrome）；不兼容的（如 `.dsf`、部分 alac）ffmpeg 转 aac/mp3 流式输出。比视频简单得多，可能不需要 HLS——先 direct、后 `ffmpeg -f mp3 pipe` 兜底即可。
- **归一化照抄 Jellyfin**：扫描期（或后台任务）`ffmpeg -af ebur128` 算曲目级 LUFS 存库（有 ReplayGain 标签直接用）；API 下发 `normalizationGain = -18 - lufs`；前端用 WebAudio `GainNode` 应用。**不烤进转码流**。专辑级归一化（整张专辑一个增益，保持曲目间相对响度）作 v2。

### 2.5 前端页面结构

| 路由 | 内容 |
|---|---|
| `/music` | 音乐域首页：最近添加专辑 + 最常播放 + 随机专辑墙 |
| `/music/albums` / `/music/albums/[id]` | 专辑网格 / 专辑详情（曲目列表 + 播放全部） |
| `/music/artists` / `/music/artists/[id]` | 艺术家网格 / 艺术家页（其专辑聚合） |
| `/music/songs` | 全部歌曲（虚拟列表） |

审美：可延续影院域的暗色系（音乐播放器暗色是主流），用专辑封面主色做局部氛围光——与现有 Kubby 视觉语言兼容。

### 2.6 播放列表与收藏（v2）

- `music_playlists`（ownerUserId, name, isPublic）+ `music_playlist_items`（playlistId, trackId, position）有序条目表；可选导出 .m3u8。
- 收藏复用"每域自己的 user-data 表"模式（照 `userMovieData` 建 `userTrackData`：favorite、playCount、lastPlayedAt）。

## 3. 分期建议

**v1（域可用）**：music_* 表 + 迁移 → music scanner（标签解析 + 封面）→ `/music` 专辑/艺术家/歌曲页 → 全局播放单例 + 底部播放条 + 队列 → direct 播放 + ffmpeg 兜底。
**v2**：音量归一化（LUFS 任务）、播放列表、收藏/播放统计、MusicBrainz 刮削、歌词显示。
**明确不做**：gapless（Jellyfin 都没做）、多端同步播放。

## 4. 与照片域的实现顺序关系

先照片后音乐。音乐动工前需要已就位的公共件（照片域会先铺好）：
- scanner 按 `library.type` 分派的入口结构
- 顶层导航域切换框架
- 库管理 UI 的"按类型显示不同表单项"模式
