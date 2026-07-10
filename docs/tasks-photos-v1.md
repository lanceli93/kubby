# Photos v1 任务清单（工作文件）

> 设计文档：`docs/photos-library-design.md`。全部完成后本文件内容移入 `docs/feature-completed.md`。
> 前置实测结论（2026-07-10）：本机 Windows 上 sharp **无法解码 HEIC**（libvips 缺 HEVC 插件），ffmpeg 转 HEIC→WebP 实测可用 → scanner 必须实现 sharp 优先 + ffmpeg 兜底。`exifr` 已安装。

- [x] **T1 Schema + 迁移**：`photo_items` 表加入 `schema.ts` + `db/index.ts` pending 数组（CREATE TABLE IF NOT EXISTS + 4 索引）+ `paths.ts` 加 `getPhotoThumbsDir()`。验收：`npx tsc --noEmit` 过；删除 data/kubby.db 后启动能自动建表。
- [x] **T2 Photo scanner**：`scanLibrary()` 按 `library.type` 分派；新文件 `src/lib/scanner/photo-scanner.ts`（递归收集、增量 mtime+size、exifr EXIF、sharp 缩略图 + ffmpeg HEIC 兜底、视频 ffprobe+抽帧、删除失踪记录）。验收：对真实照片目录扫描入库，HEIC 有缩略图。
- [x] **T3 Photos API + 视频 decide 路由**：`GET /api/photos`（cursor 分页）、`/api/photos/[id]`、`/thumb`、`/file`、`/stream/decide` + `/stream`。验收：curl 各端点返回正确；电影路由零改动。
- [x] **T4 域切换导航**：header/侧栏/底部 tab 加「照片」入口，仅当存在 photo 库时显示；记住上次所在域。验收：无 photo 库时 UI 与现状完全一致。
- [ ] **T5 `/photos` 时间线页**：按月分组 justified 网格 + 虚拟滚动 + cursor 无限加载 + 明亮主题。验收：5000+ 张流畅滚动。
- [ ] **T6 灯箱**：全屏查看、左右切换、缩放、EXIF 面板、视频内嵌播放（direct/HLS）、预加载相邻。验收：图片/视频/HEIC 三类都能看。
- [ ] **T7 库管理解锁 + i18n 收尾**：库管理 UI 解锁 photo 类型（隐藏 scraper/NFO/元数据语言表单项，后端强制 scraperEnabled=false）；补齐 en/zh 文案。验收：能建 photo 库并从 UI 触发扫描。
- [ ] **T8 文档**：feature-completed 记录 + 最新 architecture md 更新。（Fable 自己做）
