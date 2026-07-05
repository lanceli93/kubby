# Kubby Performance Analysis — v0.5.1

> **Scope**: Investigation only. This document records *where* the jank is and *what*
> to change, with empirical evidence. No code was modified. A stronger model will
> implement the fixes. **Hard constraint for every fix below: the rendered result must
> stay pixel-identical — tilt, ambient glow, glare, blur badges, parallax, poster wall
> must all still look exactly as they do today.** Every proposal here is a
> caching / sizing / deferral / layer-hygiene change, never a visual downgrade.

Date: 2026-07-05 · Target: running server at `http://localhost:8665/` · Library under
test: **JAV** (`425e1a46-…`, 2094 movies across 4 libraries).

---

## 一、结论速览 (TL;DR)

卡顿主要来自 **两个系统性问题**，而 **不是** 数据库或 React 组件本身：

1. **图片缩放完全失效** — `/api/images?w=360` 返回的是**原图字节**（`image/jpeg`，
   与不带 `w` 参数完全一致），`sharp` 在运行中的服务里返回了 `null`。所以媒体库每张
   180px 的海报卡片实际下载的是 **200–400KB 的全尺寸原图**（实测平均 386KB/张，详情页
   10 张图 = 3.8MB）。这是 JAV 库列表卡顿的**头号原因**。
2. **当前 `localhost:8665` 跑的是 `next dev`（开发模式），不是生产构建**。首次进入某路由
   有 ~1s 是 **按需编译** 的时间（trace 里的 "load delay 1079ms"），加上未压缩 bundle、
   React StrictMode + React Compiler 的双次渲染。用 `next build && next start`（或打包好的
   standalone）会立刻消除很大一部分“卡”。

数据库很快（2094 行规模下所有查询 40–60ms），API 不是瓶颈。下面按证据展开。

---

## 二、方法与环境 (Methodology)

- Chrome DevTools MCP，连接到用户已登录的真实 Chrome 会话，`1x` CPU / 无网络限速。
- 对 **JAV 媒体库页** 和 **电影详情页** 各做一次 `performance_start_trace`（reload）。
- 用页内 `fetch(..., {cache:'no-store'})` 直接测 API 与图片端点的真实耗时/字节数/`content-type`。
- 交叉核对源码（`api/movies`, `api/images`, `api/movies/[id]`, `tilt-card`,
  `use-hero-parallax`, `scroll-row`, `db/index`, `schema`）以定位机制。

> ⚠️ **环境校正**：运行进程经确认为 `node …/next/dist/bin/next dev`（见进程命令行）。
> 因此 trace 里的绝对数字**偏悲观**——生产构建下 render/compile 时间会大幅下降。凡属
> “开发模式伪影”的项已在下文标注 `[DEV-ONLY]`，不要把它们当成需要改代码的问题。

---

## 三、实测数据 (Measurements)

### 3.1 图片端点 —— 缩放是死代码

| 请求 | 返回字节 | content-type | 说明 |
|---|---|---|---|
| `poster.jpg`（原图） | 87,316 | `image/jpeg` | — |
| `poster.jpg?w=360` | **87,316** | **`image/jpeg`** | 与原图**逐字节相同**，未缩放、未转 WebP |
| `poster.jpg?w=360`（再次） | 87,316 | `image/jpeg` | 服务端无缓存差异 |
| `fanart.jpg`（原图） | 153,805 | `image/jpeg` | — |
| `fanart.jpg?w=360` | **153,805** | **`image/jpeg`** | 同样未缩放 |

- 详情页实际传输：**10 张图 / 3,861 KB / 平均 386 KB/张**。
- `node -e "require('sharp')"` 在项目根目录**能正常加载**，但运行中的服务端 `getSharp()`
  仍返回 `null`（走了 `catch`）→ 说明是 **Next 运行时**（`serverExternalPackages` + dev
  编译环境）里 `import("sharp")` 失败，而非依赖缺失。**这是必须先查清的根因。**

### 3.2 JAV 媒体库页 trace

- **LCP 2011ms** = TTFB 59 + **load delay 1079 [DEV-ONLY 按需编译]** + render delay **873**。
- LCP 元素是海报 `<img>`，`fetchpriority` 未设、`loading=lazy`、非文档内可发现（三项 discovery 检查全 FAIL）。
- DOM：1913 元素；一次 **样式重算 99ms 影响 1724 元素**；首屏网格 52 个直接子节点（50 张卡）。
- CLS 0.00（无布局抖动，`aspect-[2/3]` + blur 占位到位，这点做得好）。

### 3.3 电影详情页 trace

- **LCP 1484ms** = TTFB 44 + load delay 874 `[DEV-ONLY]` + render delay 566。
- **Forced reflow（强制同步布局）合计 408ms** —— 这是详情页**真实的**客户端卡顿信号。
- fanart 与 poster 均以**全尺寸原图**加载（`resolveImageSrc(movie.fanartPath)` /
  `resolveImageSrc(movie.posterPath)` **不传 width**，见 `page.tsx:371, 422, 763`）。

### 3.4 API 耗时（均为 SQLite 实测，非瓶颈）

| 端点 | 冷 | 温 |
|---|---|---|
| `/api/movies`（列表，50/页） | 356ms `[DEV 首次编译]` | **49ms** |
| `/api/movies?sort=title`（无索引排序） | 42ms | — |
| `/api/movies?genres=中出し`（LIKE 全表扫描） | 44ms | — |
| `/api/movies/[id]`（详情，含 cast/discs/userData 多次查询） | 53ms | — |
| `/api/filters`（加载全部行 + JSON.parse 去重） | 53ms | — |
| `/api/people` | 59ms | — |

**结论：在 2094 行规模下，数据库层不是卡顿来源。** 子代理报告里“LIKE 全表扫描 25–100ms”“标题
排序 100ms”等属于**规模化前瞻**，当前不产生可感知卡顿，列为低优先。

---

## 四、按优先级的优化清单 (Prioritized Findings)

### 🔴 P0-A — 图片缩放失效，全库下发原图 【库列表卡顿头号成因】
- **文件**：`src/app/api/images/[...path]/route.ts:14-66`
- **证据**：§3.1 —— `?w=360` 返回原图字节且 `image/jpeg`；平均 386KB/张。
- **机制**：`getSharp()` 运行时返回 `null` → 跳过 resize/WebP → 回退发原图。50 张卡片一次
  下载 10–20MB 全尺寸 JPEG，浏览器还要**全分辨率解码**再缩到 180px，占用主线程解码与内存。
- **修复方向**（不改任何视觉）：
  1. 先修好 `sharp` 在 Next 运行时的加载（确认它出现在 standalone 的 `node_modules` 且被
     `serverExternalPackages` 正确 external；打印 `catch` 的真实错误，别静默吞掉）。
  2. **加服务端磁盘缓存**：以 `filePath|mtime|width|quality` 为键，把缩放后的 WebP 落盘到
     `KUBBY_DATA_DIR/cache/images/`，命中直接零成本回传。现在即使 sharp 修好，每次请求仍会重编码。
  3. 缩放产物用 WebP，`w=360` 的海报应从 ~90KB 降到 ~15–25KB（视觉无差别，卡片本就 180px）。
- **视觉安全性**：卡片显示尺寸不变，只是把“下发全尺寸再由浏览器缩小”改成“下发正确尺寸”，
  肉眼一致（甚至更清晰，因为避免了浏览器低质降采样）。

### 🔴 P0-B — 生产环境实际在跑 `next dev` 【全站体感卡顿放大器】 `[DEPLOYMENT]`
- **证据**：服务进程 `next dev`；trace 每个路由首访有 ~0.9–1.1s 的 load delay（按需编译）；
  bundle 未压缩；`reactCompiler: true` + StrictMode 在 dev 下双执行。
- **机制**：这不是代码 bug，而是**部署方式**。开发服务器会即时编译路由、注入 HMR、跑两遍
  渲染以检测副作用——这些在生产构建里全部消失。
- **修复方向**：正式使用请以 `next build && next start` 或已打包的 standalone 运行（launcher
  打包版本本就是 standalone；确认用户测的这个 8665 是否只是开发实例）。
- **动作**：请与用户确认 8665 是否应为生产构建；若是，切到 `next start`。

### 🟠 P1 — 详情页 hero 图与 disc 图不限尺寸，下发全尺寸原图
- **文件**：`src/app/(main)/movies/[id]/page.tsx:371`（fanart 无 width）、`:422` 与 `:763`
  （poster 无 width）、`:754`（disc poster 无 width）。
- **机制**：详情页 3.8MB 图片里大头是这几张全尺寸图。fanart 顶多显示到视口宽，poster 显示约
  ~256–300px，却下发原图。
- **修复方向**：给 `resolveImageSrc` 传合理 width（fanart 用 ~1280/1920 按断点，poster 用
  ~400，disc 缩略图用 ~300）。依赖 P0-A 的缩放真正生效。视觉尺寸不变。

### 🟠 P2 — `will-change: transform` 常驻每张卡 → 合成层爆炸
- **文件**：`src/components/ui/tilt-card.tsx:170`（`will-change-transform` + `preserve-3d`）。
- **机制**：`MovieCard` 与 `PersonCard` 都包 `TiltCard`；`will-change` 使**每张卡常驻一个
  合成层**。首屏 50 张、滚动后上百张 → 上百个 GPU 层，增加合成与显存压力（尤其详情页 cast +
  多个 ScrollRow 同屏时）。
- **✅ 已排除的误报**：TiltCard 的 rAF 循环**只在 hover 时启动且会自终止**（`tick()` settled
  即 `cancelAnimationFrame`，见 `:99-116`），并非“空闲时几十个循环长跑”。子代理关于“15–60 个
  常驻 rAF”的说法**不成立**，勿据此优化。
- **修复方向**（视觉零改动）：把 `will-change` 从常驻改为**按需**——`pointerenter` 时加、
  settled 后移除（JS 切 class，或用 `:hover` 侧的 `will-change`）。倾斜效果本身完全保留。

### 🟡 P3 — 详情页 408ms Forced Reflow（布局抖动）
- **证据**：§3.3，trace ForcedReflow insight 归因于加载期一个 chunk 内的布局读取，合计 408ms。
- **可疑来源**（需在生产构建下复测确认，dev 会放大）：
  - `ScrollRow.checkScroll()` 每次 scroll 读 `scrollLeft/clientWidth/scrollWidth`
    （`scroll-row.tsx:16-21`），详情页有 ~5 个 ScrollRow 同时挂 `ResizeObserver`+scroll 监听。
  - `useHeroParallax` 的 `pointermove` 里 `getBoundingClientRect()`（`use-hero-parallax.ts:176`）。
  - 大量无内在尺寸的 `<img>` 在首次布局期触发多轮 reflow。
- **修复方向**：`ScrollRow` 的 `checkScroll` 用 rAF 批处理 / 节流，避免读写交叉；hero 的 rect
  在 `pointerenter` 时缓存一次而非每次 move 重取。行为与视觉不变。
- **优先级说明**：先切生产构建（P0-B）后**重测**，很可能这 408ms 大幅缩水，再决定是否深挖。

### 🟡 P4 — LCP 海报未标记高优先级、且懒加载
- **文件**：`movie-card.tsx:141-149`（`next/image` + `sizes="180px"`，无 `priority`）。
- **机制**：LCP discovery 三项检查全 FAIL —— 首屏第一张海报被当普通懒加载图，发现晚。
- **修复方向**：仅给**首屏前几张**卡片传 `priority`（或首图 `fetchpriority=high`）。不改布局与外观。

### 🟢 P5 — 数据层规模化前瞻（当前非瓶颈，2094 行下 40–60ms）
仅在库增长到数万条时才值得做，**现在不影响体感**，记录备查：
- `api/movies/route.ts:217-253` 用 `LIKE '%"genre"%'` 过滤 JSON 字符串 → 无法走索引、全表扫描。
  方向：genres/tags 归一化到关联表 + 索引，或 `json_each`。
- `api/movies/route.ts:441-466` 分页每页额外跑一次 `COUNT(*)` 全量再扫。方向：`COUNT(*) OVER()`
  一次拿到，或前端缓存首个 totalCount。
- `sort=title` 无 `movies.title/sort_name` 索引（`db/index.ts` 索引清单里没有）。方向：加索引。
- `api/filters` 加载全部行在 JS 里 `JSON.parse` 去重。方向：SQL `json_each` + `GROUP BY`。
- `api/movies/[id]` 有 4–5 次独立查询（cast/directors/allPeople/userData/discs）。方向：可合并，
  但实测仅 53ms，**收益有限**。

### 🟢 P6 — 已确认“做得好 / 无需动”的点
- **CLS = 0.00**：`aspect-[2/3]` 占位 + blur 占位图，无布局抖动。
- **DB PRAGMA**：已开 WAL + 外键；索引覆盖了 `media_library_id / year / date_added /
  moviePeople(movie_id) / moviePeople(person_id) / userMovieData(user_id,movie_id) /
  mediaStreams(movie_id,stream_type)` 等热点 JOIN 列。
- **图片 cache-busting**：用预存 `mtime` 拼 `?v=`，避免每请求 `fs.statSync`——设计正确。
- **PosterWall（WebGL）**：opt-in、按需 `dynamic()` 加载、有 LRU 纹理上限（140）与释放；**不是**
  本次报告的库列表/详情页卡顿来源，暂不列入。
- **对话框/媒体信息**：`MovieCard` 里 4 个 Dialog 均为 `{open && <Dialog/>}` 条件挂载，未
  常驻，开销可接受。

---

## 五、给实现模型的落地顺序 (Suggested order for the implementer)

1. **先确认部署**：8665 是否应跑生产构建；若是 → `next build && next start`，然后**重跑两条
   trace**（本文数字会明显改善，避免对着 dev 伪影优化）。
2. **修 `sharp` 运行时加载失败** + **图片磁盘缓存**（P0-A）——单项收益最大，直接砍掉库列表最大负载。
3. **给详情页/卡片图片传正确 width**（P1、P0-A 的下游）。
4. **`will-change` 改按需**（P2）——缓解合成层。
5. 重测后若详情页仍有明显 reflow → 处理 `ScrollRow`/hero rect（P3）。
6. LCP `priority`（P4）。
7. 规模化项（P5）留到库体量上量级后再做。

---

## 六、勘误 + 修复记录（2026-07-05，实现后补记）

**P0-B 撤回 —— 8665 一直就是生产构建。** 报告写作时进程检查抓到的 `next dev` 是
**:3000 的开发实例**，误当成了 8665 的服务进程。实测 8665 返回内容哈希命名的
turbopack chunk（minified、无 HMR 端点），且其进程父级是安装版 `kubby.exe`
（`C:\Program Files\Kubby`）→ 确认为打包 standalone。因此本文所有 trace 数字
**就是生产数字**，标注 `[DEV-ONLY]` 的 load delay 实际是 P4（LCP 懒加载、发现晚）
的表现，而非按需编译。

**P0-A 根因确认：`@img/sharp-win32-x64` 版本错配。** 安装版带 `sharp@0.34.5`
（JS 层）但 `@img/sharp-win32-x64@0.35.3`（native 层）。0.35.x 的 native `format()`
返回结构与 0.34.5 JS 包装层不匹配 → require 时 `TypeError: Cannot read properties
of undefined (reading 'output')` → 被 `getSharp()` 的静默 catch 吞掉 → 全站原图直发。
错配来源：`scripts/package.ts` 的 `getNpmTarballUrl()` 永远拉 npm `latest` 而非
sharp `optionalDependencies` 里钉死的版本，且完整性检查不查版本，装错后永不纠正。

**已落地修复**（`docs/tasks/perf-v0.5-fixes.md`，全部保持像素级视觉不变）：
- **A** `scripts/package.ts`：@img 包按 sharp optionalDependencies 钉版本下载；
  版本不符即替换；win32 不再下发 sharp 未引用的 libvips 包。
- **B** `/api/images`：sharp 加载失败记录真实错误（一次）；缩放产物落盘
  `KUBBY_DATA_DIR/cache/images/`（sha1(path|version)-w-q.webp，temp+rename 防并发写）。
  实测 standalone：77KB JPEG → 29KB WebP，缓存命中 ~30ms。
- **C** 详情页 fanart/poster/disc 传 width（1920/600/300）。
- **D** TiltCard `will-change` 改为 pointerenter 设置、settle 后清除。
- **E** 库网格/首页 Recently Added 前 10 张卡 `priority`（eager + fetchpriority=high）。

**未做（按计划推迟）**：P3 强制回流（先重测）、P5 规模化项。

**存量安装版热修**：已安装的 0.5.1 需以管理员替换
`C:\Program Files\Kubby\server\node_modules\@img\sharp-win32-x64` 为 0.34.5
并删除 stray `sharp-libvips-win32-x64`，或等下个安装包。

---

## 附：关键代码位置索引

| 主题 | 位置 |
|---|---|
| 图片端点（缩放死代码 + 无磁盘缓存） | `src/app/api/images/[...path]/route.ts:14-66` |
| 卡片图片请求 width=360 | `src/components/movie/movie-card.tsx:142` |
| 详情页 hero/poster/disc 全尺寸图 | `src/app/(main)/movies/[id]/page.tsx:371,411,422,754,763` |
| TiltCard（will-change 常驻；rAF 已自终止） | `src/components/ui/tilt-card.tsx:116,170` |
| Hero 视差（pointermove 读 rect） | `src/hooks/use-hero-parallax.ts:176` |
| ScrollRow（scroll 读 layout） | `src/components/ui/scroll-row.tsx:16-34` |
| 列表 API（LIKE 过滤 / COUNT 双扫 / 排序无索引） | `src/app/api/movies/route.ts:217,262,441` |
| 详情 API（多次查询） | `src/app/api/movies/[id]/route.ts:256-346` |
| DB 索引清单 / PRAGMA | `src/lib/db/index.ts:14,85-113,128,191` |
| 图片优化关闭（交给 /api/images 自理） | `next.config.ts` `images.unoptimized:true` |
