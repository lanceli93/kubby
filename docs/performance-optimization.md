# Performance Optimization: Image Loading & Rendering

## Background

Kubby 的电影列表页在加载 poster 图片时明显慢于 Jellyfin。经过对比分析，发现以下性能瓶颈。

---

## 原有性能问题

### 1. 图片未经优化直接传输（高影响）

原始 poster 图片（通常 1000-3000px 宽、200-500KB）被完整传输给仅 180px 宽的卡片组件。浏览器下载了 5-10 倍于实际需要的数据量。

- **位置**: `next.config.ts` 中 `images.unoptimized: true` 禁用了所有图片优化
- **影响**: 每张 poster 多传输 200-400KB，50 张卡片 = 10-20MB 冗余流量

### 2. 同步文件系统调用阻塞 API（高影响）

每次返回电影列表时，对每部电影的 poster 和 fanart 路径调用 `fs.statSync()` 获取文件修改时间用于缓存刷新。这是同步阻塞操作。

- **位置**: `src/app/api/movies/route.ts`、`src/app/api/people/route.ts` 等所有返回图片路径的 API route 中的 `stampPath()` 函数
- **影响**: 50 部电影 = 100+ 次同步磁盘 stat 调用，阻塞 Node.js 事件循环

### 3. 同步文件读取阻塞图片服务（高影响）

图片通过 `/api/images/` route 提供，使用 `fs.readFileSync()` 读取整个文件到内存。

- **位置**: `src/app/api/images/[...path]/route.ts`
- **影响**: 每次图片请求都阻塞事件循环，多张图片并发加载时产生排队

### 4. 图片加载无占位效果（中影响）

`<Image>` 组件没有设置 `placeholder="blur"`，poster 从空白直接跳变为完整图片。

- **位置**: `src/components/movie/movie-card.tsx`、`src/components/people/person-card.tsx`
- **影响**: 视觉上图片"突然弹出"，感知加载速度差

### 5. 卡片 Dialog 组件始终挂载（中影响）

每个 MovieCard 渲染了 4 个 Dialog 组件（MetadataEditor、MediaInfoDialog、ImageEditorDialog、DeleteConfirm），即使从未打开过。

- **位置**: `src/components/movie/movie-card.tsx`、`src/components/people/person-card.tsx`
- **影响**: 500 张卡片 = 2000+ 个冗余 Dialog DOM 节点

---

## 优化方案

### 优化 1: Sharp 服务端图片缩放 + WebP 转换

**原理**: 在 `/api/images/` route 中集成 sharp，接受 `?w=WIDTH&q=QUALITY` 参数，将原图实时缩放并转换为 WebP 格式返回。WebP 相比 JPEG 体积减少 30-50%，缩放后更是只有原图的 1/10。

**为什么不用 Next.js 内置优化器**: Next.js 的 `/_next/image` 优化器无法从本地 API route 获取图片（内部请求返回 null），因为 `localPatterns` 仅支持 `public` 目录静态文件。因此保留 `unoptimized: true`，通过 sharp 自行实现等效优化。

**涉及修改**:
- `src/app/api/images/[...path]/route.ts` — 添加 sharp resize + WebP 转换逻辑
- `src/lib/image-utils.ts` — `resolveImageSrc()` 增加可选 `width` 参数，生成 `?w=` 查询参数
- `src/components/movie/movie-card.tsx` — 传入 `resolveImageSrc(posterPath, 360)` (2x retina for 180px)
- `src/components/people/person-card.tsx` — 传入 `resolveImageSrc(photoPath, width * 2)`
- `next.config.ts` — 保留 `unoptimized: true`

**缓存策略**: 图片 URL 包含 `?v=mtime` 版本号（内容寻址），因此设置 `Cache-Control: public, max-age=31536000, immutable`。图片内容变化时 URL 变化，浏览器自动获取新版本。

---

### 优化 2: 数据库存储 mtime，消除 fs.statSync

**原理**: 将图片文件的修改时间（mtime）在扫描入库和图片上传时写入数据库。API 返回列表时直接从 DB 读取 mtime 拼接缓存版本号，不再调用 `fs.statSync()`。

**涉及修改**:

*Schema 层*:
- `src/lib/db/schema.ts` — movies 表增加 `posterMtime`、`fanartMtime`、`posterBlur` 列；people 表增加 `photoMtime`、`photoBlur` 列
- `src/lib/db/index.ts` — 添加迁移 SQL (ALTER TABLE)

*写入层*（mtime 写入时机）:
- `src/lib/scanner/index.ts` — 扫描时调用 `getFileMtime()` 获取 mtime 并存入 DB
- `src/app/api/movies/[id]/images/route.ts` — 上传后 `fs.statSync(destPath).mtimeMs` 写入 DB
- `src/app/api/people/[id]/images/route.ts` — 同上

*读取层*（stampPath 改为 DB 值）:
- `src/app/api/movies/route.ts` — `stampPath(path, mtime)` 使用 DB 存储的 mtime
- `src/app/api/movies/[id]/route.ts` — 同上
- `src/app/api/people/route.ts` — 同上
- `src/app/api/people/[id]/route.ts` — person fanart 因无 DB 列，保留单次 `fs.statSync` 回退

**图片替换安全性**: 上传新图片 → 写文件 → 读取新 mtime → 存 DB → API 返回新 mtime → URL 变化 → 浏览器/缓存失效。链路完整，不影响 edit image 功能。

---

### 优化 3: 异步文件读取

**原理**: 将图片服务从 `fs.readFileSync()`（同步阻塞）改为 `fs.promises.readFile()`（异步非阻塞），避免在读取大文件时阻塞 Node.js 事件循环。

> 注: 最初尝试使用 `fs.createReadStream()` + `Readable.toWeb()` 流式返回，但 Next.js 16 (Turbopack) 的内部图片处理管道不兼容 Web Stream 响应，回退为 async buffer。

**涉及修改**:
- `src/app/api/images/[...path]/route.ts` — `readFileSync` → `fs.promises.readFile`

---

### 优化 4: Blur 占位图

**原理**: 扫描入库时用 sharp 生成极小的 base64 缩略图（10x15px JPEG，~500 bytes），存入数据库。前端 `<Image>` 组件通过 `placeholder="blur" blurDataURL={posterBlur}` 在图片加载前立即显示模糊占位色块，消除从空白到完整图片的视觉跳变。

**涉及修改**:

*生成*:
- `src/lib/blur-utils.ts` — 新增 `generateBlurDataURL()` 使用 sharp resize 10x15 + JPEG quality 40
- `src/lib/scanner/index.ts` — 扫描时调用并存入 `posterBlur` / `photoBlur`
- `src/app/api/movies/[id]/images/route.ts` — 上传 poster 后重新生成 blur
- `src/app/api/people/[id]/images/route.ts` — 同上

*传输*:
- 所有返回图片路径的 API route 增加 `posterBlur` / `photoBlur` 字段

*展示*:
- `src/components/movie/movie-card.tsx` — 增加 `posterBlur` prop，传入 `<Image blurDataURL>`
- `src/components/people/person-card.tsx` — 增加 `photoBlur` prop，同上
- 所有使用 MovieCard/PersonCard 的页面 — 传递 blur prop

---

### 优化 5: Dialog 按需渲染

**原理**: 将卡片内的 Dialog 组件从"始终挂载"改为"打开时才挂载"（`{open && <Dialog>}`）。500 张卡片节省约 2000 个 DOM 节点和对应的 React 组件树。

**涉及修改**:
- `src/components/movie/movie-card.tsx` — 4 个 Dialog 改为条件渲染
- `src/components/people/person-card.tsx` — 2 个 Dialog 改为条件渲染

---

### 补充修复: Person 图片替换后 Movie Cast 缓存刷新

**问题**: Person 图片替换后，person detail 页面正常更新，但 movie detail 的 cast 卡片仍显示旧图片。因为 movie detail 使用 `["movie", movieId]` 查询键，未被 invalidate。

**修复**: 在 `ImageEditorDialog` 中，当 `entityType === "person"` 时额外 invalidate `["movie"]` 前缀的所有查询。

- `src/components/shared/image-editor-dialog.tsx` — handleUpload / handleDelete 增加 `queryClient.invalidateQueries({ queryKey: ["movie"] })`

---

## 定量测量数据

以下数据通过 Chrome DevTools Network / Performance API 在本地 dev 环境实测。

### 首页 (Home)

首页包含 Continue Watching、Recently Added、Favorites 三个区域，共 21 张 poster 卡片 + 3 张 landscape 封面图。

**Poster 卡片传输体积**:

| 指标 | 优化前 (原图 JPEG) | 优化后 (w=360 WebP) | 改善 |
|------|-------------------|-------------------|------|
| 平均每张 | 642 KB | 29 KB | **-95.5%, 22x 更小** |
| 最小 | ~200 KB | 12 KB | - |
| 最大 | ~900 KB | 67 KB | - |
| 21 张总传输 | ~13,482 KB | 615 KB | **-95.4%** |

**首页总图片传输**:

| 类型 | 数量 | 总体积 |
|------|------|--------|
| Poster (w=360 WebP) | 21 张 | 615 KB |
| Landscape (原图，未缩放) | 3 张 | 1,911 KB |
| **合计** | 24 张 | **2,526 KB** |

### Library 页 — Movie3（50 部电影）

50 张 poster 一次性加载的场景，最能体现优化效果。

**Poster 传输体积**:

| 指标 | 优化前 (估算) | 优化后 (实测) | 改善 |
|------|-------------|-------------|------|
| 总传输量 | ~31.3 MB | **963 KB** | **-97%, 节省 30.4 MB** |
| 平均每张 | 642 KB | 19 KB | **33x 更小** |
| 最大单张 | ~900 KB | 67 KB | - |
| 格式 | JPEG 原图 | WebP 360px | - |

**首次加载耗时（Cold，含 sharp 实时转码）**:

| 指标 | 数值 |
|------|------|
| 平均每张 poster | 387 ms |
| 最慢单张 | 882 ms |

> 注: 首次加载需要 sharp 实时转码。第二次访问同一页面时浏览器 `Cache-Control: immutable` 缓存直接命中，**0 ms 网络延迟、0 字节传输**。

### API 层对比

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| `fs.statSync` 调用 | 每页 100+ 次同步阻塞 | **0 次**（从 DB 读取 mtime） |
| 图片文件读取 | `readFileSync` 同步阻塞 | `fs.promises.readFile` 异步非阻塞 |
| HTTP 缓存策略 | `max-age=86400`（24 小时） | `max-age=31536000, immutable`（1 年，内容寻址） |
| MovieCard DOM 开销 | 每张卡片 4 个 Dialog 始终挂载 | 按需渲染，关闭时 0 个额外 DOM 节点 |

---

## Jellyfin 对比参考

| 策略 | Jellyfin | Kubby (优化后) |
|------|----------|---------------|
| 图片缩放 | SkiaSharp 服务端缩放，URL 带 `?maxWidth=` | sharp 服务端缩放，URL 带 `?w=` |
| 缓存刷新 | ImageTag (内容哈希) | mtime 版本号 (`?v=mtime`) |
| HTTP 缓存 | 长期缓存 + content hash | `immutable, max-age=1年` + mtime 版本号 |
| 数据缓存 | TanStack Query, `placeholderData: keepPreviousData` | TanStack Query, `staleTime: 60s` |
| 占位图 | ImageBlurHashes (DTO 级别) | posterBlur / photoBlur (DB 级别, base64 data URL) |
