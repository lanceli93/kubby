# Completed Features

## 2026-07-07: 首页演员海报墙 Tab — People 马赛克墙 + 偏好页分区配置

首页顶部新增第三个 tab「演员/People」: 整页动态马赛克墙, 图片来源为演员 poster(photo)+ 自己的 fanart + 图库(gallery)图片; 与电影墙相同的 8s 随机聚光灯 + 左下字幕(NOW SHOWING · 类型 / 姓名 / 出生年 · 作品数 · ★ 个人评分 · ♥ 收藏), 整个 hero 点击进入 `/people/[id]`。该 tab 不再显示媒体库/继续观看等内容行, 墙覆盖整个页面。

- **入选硬规则**: 演员必须有 poster(photo_path)才入墙; 无 poster 则完全排除(其 fanart/gallery 也不出现)。
- **`GET /api/people/hero-wall`**(新): 读取已存 `peopleMosaicConfig`, 支持 query 覆盖(偏好页预览); 有照片 + ≥1 部影片(INNER JOIN movie_people)+ 类型/仅收藏筛选, RANDOM 抽样; 每人展开为扁平条目 — photo 条目(id=personId, 带自身 fanart 配对)+ 最多 galleryCount 张图库条目(id 加 `:gN` 后缀避免马赛克聚光灯寻址冲突, `personId` 供导航), Fisher-Yates 打散后截断。
- **`src/lib/people-mosaic-config.ts`**(新): `PeopleMosaicConfig`(列数 8–24/角度/滚动方向/includeFanart/includeGallery/galleryCount **0–100**/`tiers` 评级多选(复用 `Tier` SSS…E + `unrated`, []=全部无筛选, **默认无 filter**)/favoritesOnly)+ normalize(永不抛错)。
- **DB**: `user_preferences.people_mosaic_config`(schema.ts + db/index.ts 迁移数组双处更新, 编号 0034)。
- **`src/components/home/people-hero.tsx`**(新): 复用 HeroMosaic(style 固定 "both", photo 与自身 fanart 成对点亮), 满屏高度, 无轮播回退/无播放按钮; <8 个可用条目显示居中空态提示; ambient 环境光随聚光灯 photoBlur 变化。
- **偏好页分区**: `/preferences/hero-mosaic` 拆为「电影海报墙」/「演员海报墙」两个带分隔线的 section; 演员区含实时预览(21:9, 静态)+ 布局(方向/列数/角度)+ 图片来源(fanart 开关/图库开关 + 每人图库数滑条 **0–100**)+ 筛选(**评级 tier 多选 chip, 带各 tier 颜色, 默认全不选=无筛选** + 仅收藏开关); 单个 Save 一次 PUT 同时保存两墙配置并 invalidate 两个 hero-wall 查询。
- **调整(2026-07-07 补)**: 图库每人上限 10→**100**; 演员墙筛选从"人物类型(演员/导演/…)"改为**评级筛选**(参考 `/api/people` 的 tier SQL 分档: SSS≥9.5 / SS≥9.0 / S≥8.5 / A≥8.0 / B≥7.0 / C≥6.0 / D≥5.0 / E>0 / unrated 无评级), 默认无 filter。原因: 演员墙本就只放演员, 类型筛选无意义。
- **i18n**: `home.peopleTab`、新 `peopleHero` 命名空间、`heroMosaic` 分区/来源/筛选键(EN+ZH)。
- 验证: tsc + build 通过; chrome-devtools 实测 tab 切换/聚光灯轮换/字幕跟随/点击进详情/偏好保存往返/API 筛选与图库条目均正常。

## 2026-07-06: 首页黑屏底部误显轮播指示条(已修)+ 详情页跳转幽灵横线(判定为 Chrome 合成瑕疵, 相关改动已回退)

### 首页黑屏底部误显一排短线 (`home-hero.tsx`) —— 已修复
用户截图: 墙刷出来前的黑屏底部中间有一排短横线。根因: `wallPending` 期间 `wallMode=false`, 而轮播 hero items(继续观看/最近添加)响应快、已到位, `items.length>1` 成立, 于是渲染了**轮播模式的 slide 指示条**; 墙一到又 `wallMode=true` 使其消失 —— 闪现一下。修复: 指示条渲染条件加 `!wallPending`, 加载期间不显示。MutationObserver 全程监控确认 `button[aria-label^="Slide "]` 在整个加载窗口内再未出现。

### 首页黑屏 → 墙淡入 (`page.tsx`, `home-hero.tsx`, `hero-mosaic.tsx`, `globals.css`) —— 已保留
- 墙查询不再等偏好(`enabled: !!prefs` 移除): hero-wall 端点读数据库里已存的配置, 客户端无需先拿 prefs。`performance` 实测暖刷两请求相差仅 78ms, 确为并行; hero-wall 本身 331ms。配置变更靠偏好页保存时显式 invalidate 触发重取。
- hero 占位从首帧渲染(`wallPending || !prefs` 时渲染深色壳), 避免下方内容行跳动; 新增 `mosaicEnter` keyframe(1.1s, opacity+scale, `motion-reduce` 关闭)让墙从深色占位淡入, 不再硬切。

### 详情页跳转磨砂框内闪过横线 —— 判定为 Chrome 合成瑕疵, 本轮改动已全部回退
连续三次尝试均未真正解决(07-05 (4) 面板命名 `movie-info`; 07-05 (5) `waitForDetailPoster` 600→1800ms + `:only-child` 兜底; 07-06 关闭 root 交叉淡化)。用户报告: 用 F12 debugger 一 pause, 横线即消失 —— 典型的浏览器合成层刷新瑕疵, 非本项目 DOM/CSS 逻辑可控。
**决定不再纠结此问题**, 且因上述改动带 tradeoff(尤以"关闭 root 交叉淡化"会影响每一次卡片→详情跳转的默认淡入观感, `waitForDetailPoster` 延长会让慢速取数时旧页冻结更久), **将三处改动全部回退到 07-05 (3) 的原始状态**:
- `src/app/globals.css` VT 块: 移除 `::view-transition-old/new(root)` 与 `:only-child` 规则, 恢复"其余走默认 root 交叉淡化"。
- `src/app/(main)/movies/[id]/page.tsx`: 面板去掉 `view-transition-name`, 注释还原。
- `src/lib/view-transition.ts`: `waitForDetailPoster` 超时 1800→600ms。
经比对, 这三文件已与 07-05 (3)(`0261fe1`)逐字节一致(仅 globals.css 多出与本问题无关的 `mosaicEnter` keyframe)。GIF 对比法(放慢动画截图)也已证明不可靠, 相关 `vt-ghost-*.gif` / `home-hero-enter.gif` 已删除。

## 2026-07-05 (3): 收藏页改为子标签 + 完整网格 + 修复卡片收藏按钮无法点击

用户反馈两点:(1) 收藏页只显示单行 ScrollRow, 想要和"媒体库点进去"一样的完整浏览体验;(2) 卡片上的收藏(红心)按钮点不动。真机 (Chrome) 复验: 收藏影片计数 2→1→2, 点心成功增删收藏且不再误跳详情页。

### 新组件 `src/components/movie/favorites-browser.tsx`
`FavoritesBrowser`(可选 `libraryId`)—— 收藏影片 / 收藏演员两个子标签, 各自是完整响应式网格 (`grid-cols-2 md:grid-cols-[repeat(auto-fill,180px)]`) + 无限滚动, 标签上带总数徽标。影片查询复用 `filter=favorites` 分页端点, 演员查询用 `people?filter=favorites` 分页, 取消收藏/删除后失效对应 query。空态按子标签分别提示。

### 两个入口都接入
- 影片页 `/movies?tab=favorites`(`src/app/(main)/movies/page.tsx`): `<FavoritesBrowser libraryId={libraryId} />` 取代旧的 `FavoritesTabContent` + `FavoritesOverview`(单行 ScrollRow)+ `FavoritesMoviesGrid` / `FavoritesActorsGrid`(靠点击行标题 `?view=` 钻入的完整网格)。删掉这四个组件和随之孤立的 `ArrowLeft` 导入;`?view=movies|actors` 钻入路由不再需要。
- 首页顶部收藏 pill tab (`src/app/(main)/page.tsx`): 两个 ScrollRow 换成 `<FavoritesBrowser />`;删掉孤立的 `favoritePeople` 查询、`togglePersonFavorite` mutation 和 `PersonCard` 导入。

### 卡片收藏按钮无法点击 (`src/components/movie/movie-card.tsx`)
根因是 3D 命中测试, 不是 z-index。居中播放按钮的覆盖层 `absolute inset-0` 且带 `tilt-lift`(`translateZ(40px)`), 在 `preserve-3d` 的 TiltCard 内被抬到最靠近视口的平面, 整片吞掉指针事件 —— 悬浮条里的红心/已观看/更多按钮 z-index 虽更高但 Z 深度更低, 点击遂冒泡到外层 `Link` 变成跳转详情页。修复: 覆盖层加 `pointer-events-none`, 只给真正的播放按钮 `pointer-events-auto`。(印证记忆里"transform 祖先劫持指针"一条。)

## 2026-07-05 (2): 首页海报墙配置页 — 列数/风格/角度/媒体库占比/筛选 + 实时预览

用户要求把 hero 马赛克墙做成可配置的, 菜单放偏好设置新条目。四个任务并行/串行派发给 executor 子代理 (T1 sonnet, T2–T4 opus), 全部真机验证通过 (Chrome 实测: 风格切换 384 块全横版、角度 transform 实时切换、列数 10 列生效、年份筛选池子缩到 13 部、保存后主页跟随、恢复默认)。

### 配置模型 (`src/lib/hero-mosaic-config.ts`, new)
`HeroMosaicConfig`: 列数 8–24 (默认 16) / 风格 poster|fanart|both (默认 both) / 角度 flat|gentle|classic|steep|reverse (5 档 CSS transform 预设, classic = 原硬编码值) / `libraryWeights` (空对象 = 按库随机, 非空 = 加权采样, 0 或缺失 = 排除) / yearFrom/yearTo/minWidth 筛选。`normalizeHeroMosaicConfig` 把任意残缺/非法输入合并到默认值上, 永不抛错——DB 存的 JSON 损坏也只会退回默认。

### 持久化
`user_preferences.hero_mosaic_config` TEXT 列 (schema.ts + db/index.ts `pending` 迁移数组 0033 双更新), personal-metadata GET/PUT 透传 (读取时 normalize, 写入时 normalize 后 stringify)。

### `/api/movies/hero-wall` (new)
主页墙的影片池端点, 取代 `sort=random`: 读已存配置 → query 参数覆盖 (偏好页预览用; 空串/"null" = 显式清除筛选, 缺失 = 用已存值) → 风格/年份/分辨率过滤。加权采样: 按权重比例分配配额 (修正舍入漂移), 每库单独 `ORDER BY RANDOM()`, 不足时从其余加权库补齐, 最后 Fisher–Yates 打散避免同库扎堆。

### HeroMosaic 组件改造
`config` prop (默认值 = 旧行为): 列数驱动列数组, `DRIFT_DURATIONS` 取模复用; 风格决定列填充 (both 保持海报→自身剧照成对, 单风格每部一块); perColumn 公式按列数和瓦片纵横比推导 (保持无缝循环不变量: 单组瓦片高度 ≥ 可见平面); 角度经内联 style 应用 (Tailwind 看不见运行时值)。主页 queryKey 带上数据相关字段, 保存偏好后墙自动重抽。

### 偏好页 `/preferences/hero-mosaic` (new, 侧边栏第一项)
复用 card-badges 的玻璃卡结构: 顶部实时预览 (真实 HeroMosaic 组件, `featuredEnabled=false`; 数据字段变化才重新请求预览池, 列数/角度纯客户端重渲染, `placeholderData` 防闪烁; <8 部显示提示), 列数滑块, 风格分段按钮, 5 个角度缩略图 (真实 transform 缩小版), 媒体库占比 (自定义开关 + 0–100 滑块 + 百分比读数), 年份范围 + 最低分辨率 (不限/HD/FHD/2K/4K), 保存后同时失效 userPreferences 和 hero-wall 查询。i18n en/zh 全覆盖。

### 踩坑
- executor 生成的预览请求对 weights 做了 `encodeURIComponent` + `URLSearchParams`(双重编码, 服务端 JSON.parse 会拿到仍带 %22 的串), 编排者审查时改为直接 `params.set`。
- 旧 dev server Jest worker 崩溃残留在 3000 端口 (返回 500), 需 kill 后重启才能真机验证。

### Round 2 (同日用户反馈修复)
1. **聚光灯与影片名不匹配**: 根因是选取 effect 的闭包持有旧 render 的 `tileMovies`/`tilePairs` map——主页上偏好 (columnCount) 通常晚于墙数据到达, 重排后所有 tile 地址变了, 闭包还按 16 列地址解析。修复: map 每次 render 写入 `tileMapsRef`, `pick()` 只经 ref 读取; effect deps 加 `config.columnCount/style/flow`, 重挂时清掉旧点亮地址。
2. **横向滚动风格**: `flow: "vertical"|"horizontal"` (纯 JSON 字段, 无需迁移)。横向 = 行内 `translateX(-50%)` 无缝循环 (`mosaicDriftX` keyframe), 相邻行反向, 海报→自身剧照配对保持相邻; 列数滑块统一映射行数 (`round(cols*0.45)` clamp 4–12); Card 转置为 h-full + aspect 推宽度。内部 `columns/col` 泛化为 `lanes/lane`。
3. **偏好设置默认落卡片标记**: `/preferences` redirect 改为 `/preferences/hero-mosaic` (侧边栏第一项)。
4. **可被选中影片上限太少**: 旧可选区仅右中窄带 (X 38–80%), 很多影片永远进不了聚光灯。修复: 扩大到近全墙 (X/Y 8–92%/8–72%, 保留文字块与底部渐隐排除), 并加 session 级 `featuredHistoryRef`——优先选没亮过的影片, 全部轮完后重置, 保证每部上墙影片都有机会被 featured。

真机复验: 3 个连续聚光灯周期 lit tile 的 movieId 经 API 反查标题与 caption 全部一致; 保存 10 列后主页跟随且配对点亮正常; 横向模式 7 行 translateX 条带; `/preferences` 落海报墙页; flow 三次往返读写无损。

## 2026-07-05: 首页 Hero 三轮迭代 — Netflix 式动态海报马赛克墙 + 聚光灯同步

Round 1 的单张剧照 Hero 被用户否掉（"平庸/没有呼吸感/按钮不好看"）。三轮迭代后定稿：

### Round 2: 轮播 + 白底主按钮
8s 交叉淡入轮播（继续观看前 3 + 最新添加补足 5 部）、白底黑字圆形播放按钮（去掉误看成下划线的内嵌进度线）、两行剧情简介、可点击的底部时长指示条、逐片环境光换色。悬浮海报卡（TiltCard）后来被 Round 3 的墙取代。

### Round 3: 动态海报马赛克墙 (`hero-mosaic.tsx`, new)
用户给了 Netflix 登录页的倾斜海报墙截图，要求做成"活的"。实现：16 列海报（随机采样 60 部，`sort=random` 新增到 movies API——每部影片都有机会上墙），整面墙 `perspective(1600px) rotateX(24°) rotateZ(-16°)`（画的底边朝观者倾 + 逆时针转），每列独立速度（70–125s）无缝 translateY 循环、相邻列反向，每列第 3 张有 fanart 的换横版卡。列内容复制两份 + pb 补 gap 使 -50% 循环无缝。角度经 4 次用户实时调参定稿。

### Round 4: 聚光灯同步（墙驱动 Hero）
架构反转：**墙是节拍器**。每 8s 从"完整可见区"（中间约六列、避开左下文字块与底部渐隐）随机选一张亮牌——暗色遮罩淡出（改为逐卡遮罩，替代全局 bg-black/55）、背后 blur-2xl 光晕绽放（复用 movie-card hover 光晕语言）、ring 增亮、scale 1.05、z-10 盖过邻居——并通过 `onFeature` 回调上报影片；Now Showing 文字块、播放/详情按钮、环境光底色全部跟随这部影片。单一时钟，无二次计时器；旧轮播只在墙不足 8 部时兜底。

**关键坑（已记录 memory）**: perspective 变换下 `getBoundingClientRect` 返回的是倾斜卡片的外接 AABB（远大于卡片本身），"整卡在区域内"永远不成立——必须用卡片中心点 + 放宽边距判定，否则聚光灯永远选不出候选（首次实测 eligibleCount=0，标题 8.5s 不换）。

### 杂项修复
- Hero 标题：单行 truncate + `leading-[1.25]`（text-5xl 默认行高裁掉 g/y/p 下伸部）+ 宽度放宽到 max-w-3xl。
- 继续观看卡、媒体库卡补上 hover 光晕（媒体库无 posterBlur 用封面图本身）。
- 指示条 z-20（内容行 z-10 上叠会挡点击）；媒体库行不再上叠 Hero，改纯下移。
- 踩坑：JSX 注释不能插在 `{cond && (` 和元素之间（Turbopack parse error）；dev server Jest worker 崩溃需手动重启。

## 2026-07-04 (9): 首页视觉升级 — Now Showing Hero + Ambilight 环境光场

User request: "主页面现在略显朴素" after the 3D poster wall work. Direction chosen (A+B from proposal): full-bleed hero + ambient light field. Verified live in Chrome (hover retarget, tab pills, sidebar, favorites tab, scrolled state; zero console errors).

### 1. Now Showing Hero (`src/components/home/home-hero.tsx`, new)
Full-bleed cinematic hero at the top of the home page: first continue-watching item, else the first recently-added movie with fanart, else no hero. `h-[46vh] md:h-[58vh]` backdrop with a slow Ken Burns drift (`animate-ken-burns`, 36s alternate, `motion-reduce:animate-none`); three gradient scrims (bottom dissolve `from-[#0a0a0f]` melts the image into the page — content rows rise into it with `-mt-8 md:-mt-14`; left text scrim; top scrim for the transparent header). Typography mirrors the poster wall's boxless caption language: `NOW SHOWING · 继续观看` eyebrow (tracking-[0.3em]), text-shadow display title, middot-separated meta row (year / bordered resolution chip / runtime / purple community ★ / gold personal ★). Actions: primary rounded-full Resume/Play button with an embedded progress line when partially watched (`inset-x-4 bottom-1.5 h-[2px]`), glass Details button. Whole hero links to the detail page; buttons stopPropagation.

### 2. Ambilight 环境光场 (`src/lib/ambient-color.ts` + `src/components/home/ambient-field.tsx`, new)
Ambient color field behind all home content: three large blurred radial blobs (`blur(80px)`, opacity 0.10–0.16) whose color eases toward whichever poster you hover. Color source: each movie's existing `posterBlur` data URL, averaged on a tiny canvas then HSL-clamped for the dark background (S∈[0.25,0.55], L∈[0.16,0.30]; grayscale → indigo fallback), promise-cached. Animation follows the TiltCard idiom: imperative target + self-terminating rAF loop with exponential smoothing (τ=600ms), writing `--ambient` via ref — zero React re-renders while animating. 120ms hover dwell so skimming a row doesn't strobe; 9s CSS breathing pulse; reduced-motion snaps instantly and kills the breathe. Hero sets the resting base color from its own posterBlur (`AmbientBaseFromHero`). Cards are wrapped in `AmbientHoverZone` (a real div — `display:contents` can't take pointer events); `MovieCard` itself untouched.

### 3. 首页重构 + 顶栏 (`page.tsx`, `app-header.tsx`)
Tabs bar (bordered, opaque) replaced by floating glass pills top-center, in the poster wall's sort-pill language (`glass-btn rounded-full`, active `bg-primary/25 border-primary/50`), default-variant styles overridden with `!`. Header on `/` becomes absolute + transparent like detail pages; the header itself is `pointer-events-none` with `pointer-events-auto` restored on its two icon groups so the empty center doesn't block the pills; NavSidebar wrapped in a zero-size `pointer-events-auto absolute` div (absolute keeps it out of the flex flow — as a third flex item it pushed the icon group toward center; caught in live verify). Favorites tab and hero-less home get `pt-16`.

### 4. i18n
New `home` keys (EN/ZH): heroResume (Resume/继续播放), heroPlay (Play/播放), heroDetails (Details/详情).

## 2026-07-04 (8): 卡片光晕截断/缺失修复 + 海报墙字幕式信息框

Third polish round; all verified live in Chrome.

### 1. 横向滚动 row 里 hover 光晕/放大被上下截断 (`scroll-row.tsx`, detail 页 discs row)
Root cause: per CSS spec, `overflow-x: auto` forces computed `overflow-y` to `auto` as well, so the ambilight glow (`scale-110 blur-[24px]`) and the `hover:scale-[1.03]` card bleed were clipped at the scrollport's vertical edges. First attempt gave 40px of padding compensation — not enough: a Gaussian blur(24px) has a visible tail of ~50-60px, so a faint clip line remained at the top and left (user caught it). Final fix, all md+ only, net-zero layout via negative margins: **vertical** `md:-my-20 md:py-20` (80px > the blur's visible falloff — no seam); **horizontal** capped at 40px by the page gutter (`md:-mx-10 md:px-10` + `md:scroll-px-10` for snap), so a `mask-image: linear-gradient(to right, transparent, black 40px, …)` fades the outer 40px — the glow (and cards mid-scroll) dissolve at the row edges instead of hard-clipping. The enlarged transparent box gets `md:pointer-events-none` + `md:[&>*]:pointer-events-auto` so it can't steal hovers/clicks from content above/below; title row keeps `relative z-10`. Applied to `ScrollRow` and the detail page's discs row. Measured: glow rect has 61px top clearance (tail ends before the clip) and enters the left mask fade smoothly. Shrinking the glow itself was rejected by the user ("不能缩小光晕").

### 2. 部分场景 hover 卡片没有光晕 — blur 字段没传到卡片
The glow only renders when `posterBlur`/`photoBlur` is passed. Gaps fixed: detail page 猜你喜欢 row (interface + prop), people detail filmography, movies page FavoritesMoviesGrid, and the entire search page — `/api/search` never selected `poster_blur`/`photo_blur` at all (added to searchMovies/searchGenres/searchTags previews/searchPeople + interfaces + all 6 card call sites).

### 3. 海报墙信息框去黑盒 → 字幕式 cinema caption (`poster-wall.tsx`)
User verdict on the opaque box: "一个黑框太难看了不优雅". Replaced with a boxless caption: full-width bottom gradient (`from-[#06060a]` exactly matching the wall backdrop, so no visible edge — it also grounds the poster reflections), title in `text-xl tracking-wide` with a soft text-shadow, metadata as a middot-separated line (items built as a filtered array then interleaved — no dangling dots when fields are missing), minimal bordered resolution chip. Focus change re-mounts the caption via `key` to re-run a 280ms fade+6px-rise entrance (`animate-caption-rise` in globals.css, `motion-reduce:animate-none`).

## 2026-07-04 (7): 海报墙布局修复 + 移除放映机光锥

Second feedback round on the Cover Flow wall; all verified live in Chrome.

### 1. 墙只占屏幕中间一小块 / 遮挡排序标签 (`poster-wall.tsx`)
Two stacked causes. (a) The wall's `fixed inset-0` overlay was rendered inside the movie grid, whose `animate-fade-in-up` entrance animation leaves a `transform` on an ancestor — a transformed ancestor turns `position: fixed` into "fixed relative to that box", shrinking the overlay to the grid's rect (measured 1601×770 at x=48 y=93 in a 1707×932 viewport). Fixed with `createPortal(..., document.body)`. (b) The camera was fixed at z=7.5 regardless of viewport, and the focused poster could overlap the pill row. Replaced with a `refit()` (init + resize): reserves 96px top (pills) + 150px bottom (HUD), solves camera distance so the focused poster exactly fills the remaining band (`camZ = FOCUS_Z + visH/(2·tan(fov/2))`), and offsets camera y so the band centers between the reserves; backdrop enlarged to 200×120 and far plane to 500 so no black edges at large camZ.

### 2. 点击海报后闪过 library 网格再进详情
`onClick`/Enter called `onClose()` before `router.push()` — the grid became visible for the frames between wall unmount and detail mount. Removed the `onClose()` in both paths; the wall stays mounted until the route change unmounts the movies page. Verified with a MutationObserver during navigation: zero frames where the grid was visible without the detail page. ESC/X still close normally.

### 3. HUD 全透明与海报文字重叠
HUD got an opaque backing (`bg-[#0b0b12]/90 backdrop-blur-md border-white/10 shadow-2xl`), and the reserved bottom band means it no longer sits on top of the focused poster at all.

### 4. 放映机光锥移除 (`projector-beam.tsx` deleted)
User verdict after seeing the visible version: adds nothing, not good-looking ("打光感觉没什么用也不好看"). Deleted the component, its dynamic import and mount in the detail page. The premultiplied-alpha compositing lesson it produced stays recorded in (5) and memory.

## 2026-07-04 (6): 海报墙 v2 — 唱片架 Cover Flow + 元数据整合(重写)

User rejected the v1 flat curved grid as crude ("还不如苹果的 cover flow 好看") and asked for functional metadata interaction, not just looks. Full rewrite of `poster-wall.tsx` (~1100 lines), verified live in Chrome.

**Layout/motion**: focused poster front-facing (1.35×, z+2.2), side posters stacked like records in a crate (rotY ∓1.05rad); all transforms derive continuously from `index − focusFloat` so scrubbing is seamless; per-frame exponential smoothing (`1−exp(−dt/120ms)`) with a self-terminating loop. **Metadata**: top sort pills (same 8 dimensions as the movies page, client-side, active pill toggles asc/desc) → sort change animates as a full flying reorder; 3D group divider cards auto-derived from the sort dimension (decades / 4K-2K-FHD-HD-SD tiers / rating bands / size bands, canvas-textured, focusable not navigable); bottom HTML HUD (updates only on integer focus change) shows title + year·resolution badge·codec·size·runtime·ratings. **Polish that killed the crude look**: per-poster mirror reflections with shared gradient alphaMap, gradient backdrop, mipmaps + anisotropic filtering (v1's LinearFilter-no-mipmap shimmered at crate angles). **Scale**: texture LRU — concurrency 6 nearest-focus-first, ±60 resident window, 140 cap with dispose-on-evict. **Interaction**: wheel one-per-tick (accumulated, trackpad-friendly), continuous drag scrub (120px/item + velocity flick ±6), click-side-to-focus, click-focused/Enter navigates, full keyboard nav, ESC/X exit. Orchestrator fix during verification: `setPointerCapture`/`releasePointerCapture` throw NotFoundError if the pointer is already gone — wrapped in try/catch. API: added `runtimeSeconds`/`videoCodec`/`fileSize` to the movies list select (additive). Data flows from the existing grid query; `initialSort` maps the page's releaseDate→year.

## 2026-07-04 (5): UI 现代化用户反馈修复 — 快速入场抖动、光锥不可见

User feedback on the Phase 2+3 delivery. Both verified live in Chrome.

### 1. 快速移入鼠标时 3D 倾斜突兀跳变 (`tilt-card.tsx`, `use-hero-parallax.ts`)
Both animations wrote the pointer's *target* value straight to the DOM each rAF: a fast entry lands the first pointermove near a card edge, jumping the transform 0 → ±maxTilt in one frame; re-entering mid-reset also killed the 350ms CSS transition mid-flight. Replaced with framerate-independent exponential smoothing (`current += (target−current) · (1−exp(−dt/90ms))`) in a self-terminating rAF loop; pointerleave settles back through the same loop, and all CSS transition writes were removed. Scroll parallax stays 1:1 immediate (scroll-linked motion must not lag). Measured: worst-case corner entry now eases 0 → 0.32° → 0.61° → … instead of snapping to 3.6°.

### 2. 放映机光锥完全不可见 (`projector-beam.tsx`)
Two compounding causes. (a) Shaders output premultiplied color (`rgb = color·v, a = v`) but materials used three.js `AdditiveBlending` (`SRC_ALPHA, ONE`) and the canvas was created with `premultipliedAlpha: false` — alpha multiplied the already-low intensity a second time, squaring ~0.16 into imperceptibility. (b) Even correctly composited, low-intensity additive light over *bright* fanart is physically invisible — a real projector beam reads because the room is dark. Fix: `premultipliedAlpha: true` + `CustomBlending(ONE, ONE_MINUS_SRC_ALPHA)`, and the beam shader now also *dims the fanart outside the cone* (uDim 0.28 via the alpha channel) so the beam punches through with real contrast. Intensity raised to 0.34 (beam) / 0.9 (dust). Verified: beam clearly visible over the Shawshank hero, title/glass panel unobstructed.

## 2026-07-04 (4): UI 现代化 Phase 2+3 — 详情页深度舞台、放映机光锥、WebGL 海报墙

All verified live in Chrome (parallax transform values, VT poster intact, glass blur intact, poster-wall hover/click/exit, three.js chunk isolation).

### 1. 详情页深度舞台 (`src/hooks/use-hero-parallax.ts` + detail page)
Scroll parallax (fanart sinks at 0.35× scrollTop) + pointer parallax (fanart drifts ±10px opposite the cursor, poster ±5px with it), rAF-throttled ref mutation, zero re-renders. The 350×525 poster is wrapped in TiltCard (maxTilt 4) with an always-lit ambient glow. Desktop-only (`pointer: fine` + md+ + no reduced-motion); suspended in fanartMode. Two constraints held: no transformed ancestor above the `backdrop-blur-[20px]` glass panel (transform would break its backdrop-filter), and the `data-vt-poster` element unchanged so the View Transition morph still fires. Orchestrator fix during verification: the page early-returns a loading state before `movie` arrives, so the hook's listener effects bound to null refs on first mount — added a `ready` flag (re-binds once the hero DOM exists) and moved the hook call below the `movie` query.

### 2. 放映机光锥 (`src/components/movie/projector-beam.tsx`)
Transparent WebGL overlay on the detail hero (`pointer-events-none absolute inset-0 z-0`): additive ShaderMaterial beam entering top-right angled down-left (warm white core, indigo #6366f1 edge, ~3% lamp flicker, 0.16 intensity), 160 dust motes drifting inside the beam volume, animated film grain at 0.04. Dynamically imported (`ssr:false`), mounted only when fanart exists and not in fanartMode; gated off on reduced-motion / no WebGL2 / below md; pixelRatio capped at 1.5; rAF pauses via IntersectionObserver + visibilitychange; full disposal on unmount. Known limitation: with only ~700px of scroll range the hero never fully leaves the viewport on short pages, so the IO pause rarely triggers there — it matters on long pages (many cast rows/bookmarks) where it does trigger.

### 3. WebGL 海报墙 (`src/components/movie/poster-wall.tsx` + movies page)
Optional fullscreen browse mode on /movies (glass pill "海报墙"/"Poster Wall" toggle next to Sort/Filter, only when WebGL2 + md+ + no reduced-motion): 2:3 poster planes on a curved arc (2 rows if >40 movies), dark placeholder materials with textures streamed nearest-first (concurrency 6, SRGBColorSpace), inertial wheel/drag pan clamped to wall ends, raycaster hover (8% scale + glass title badge + pointer cursor), click navigates to the movie detail, ESC/X exits. rAF loop stops when settled and on document.hidden; full disposal on unmount. Reuses the grid's current filter params; fetches up to 500 when the infinite query hasn't loaded everything. Three.js (~506KB) stays in its own chunk via `dynamic()` — the movies page initial bundle is unchanged. Verified live: hover title badge correct (The Dark Knight), click navigated to its detail page and closed the wall.

## 2026-07-04 (3): UI 现代化 Phase 1 — 3D 深度卡片 + View Transitions 海报飞入

Apple-TV-style spatial depth without moving the DOM into WebGL. Verified live in Chrome (tilt transform values, glare opacity, transition started→ready→finished, no unhandled rejections).

### 1. TiltCard — 指针倾斜 + 光泽 + 视差 (`src/components/ui/tilt-card.tsx`)
Reusable primitive: perspective 900px wrapper, preserve-3d inner element tilting ≤6° toward the cursor (rAF-throttled ref mutation, zero React re-renders), radial-gradient glare following the pointer, `.tilt-lift` utility for translateZ parallax (badges 22px, play button 40px). Applied to MovieCard, PersonCard, ContinueWatchingCard, LibraryCard. MovieCard/PersonCard additionally render an ambient glow (ambilight) behind the card from the existing blur placeholder. Touch + `prefers-reduced-motion` degrade to exactly the old behavior; dropdown-open freezes flat. Key structural constraint: `preserve-3d` breaks `backdrop-filter` on descendants in Chromium, so the glass hover bars/progress bars moved outside the tilting subtree as absolutely-positioned siblings.

### 2. View Transitions poster morph (`src/lib/view-transition.ts`)
Zero-dep shared-element transition: clicking a movie card assigns `view-transition-name: movie-poster` to that poster only (avoids duplicate-name skips when the same movie appears in multiple rows), starts `document.startViewTransition`, navigates, and waits for the detail page's `data-vt-poster` element via MutationObserver before resolving. 420ms fluid curve in globals.css. Fallback to plain navigation on Firefox/no-API, reduced motion, and mobile (detail poster is `hidden md:block`). Two pitfalls fixed during live verification: (a) rendering is frozen while the update callback is pending — rAF never ticks, so waiting on it deadlocks into Chrome's ~4s abort; wait with timers/`img.decode()` instead; (b) detail→detail navigation (recommended row) leaves the old page's statically-named poster in the old snapshot — it's demoted before starting.

Rejected approaches: Next 16.1.6's `experimental.viewTransition` flag is schema-only (not wired into the App Router runtime); stable React 19.2.3 doesn't export `unstable_ViewTransition`; `next-view-transitions` package unnecessary.

## 2026-07-04 (2): Keyframe cache invalidation on source file swap

The keyframe index (fix 2 below) cached scan results keyed only by file path. Swapping a source file in place (same path, new content — e.g. re-encoding or replacing a bad rip) returned the old file's keyframes, so every seek snapped into roughly the first 2 minutes even though the DB duration had updated correctly from the rescan. `getKeyframeIndex()` now stats the file and stores `mtimeMs`+`size` alongside the cached promise; a mismatch triggers a fresh ffprobe scan instead of reusing the stale entry.

## 2026-07-04: Seek polish — progress-bar backward flick, 8K direct-play keyframe snapping

Follow-up fixes to the 2026-07-03 (2) batch, from user testing feedback.

### 1. Progress bar flicked backwards after drag release (ABP-181, all HLS playback)
`seekTo` floored the seek target (`Math.floor(clamped)`) for the offset and UI state, so releasing the drag at e.g. 51.17% snapped the bar back to 51.00% for one frame before the video caught up — visible as a backward flick. Now the fractional seconds are kept end-to-end (fast path, server-seek offset, and the `seekToSeconds` sent to the server — FFmpeg accepts fractional `-ss`). Measured: bar goes 25.7% → 51.17% monotonically, zero backward movement, in both the fast path and the full server-restart path.

### 2. 8K VR direct-play seek stalled 2–3s (Jibaro)
Direct play seeks used precise `video.currentTime = target`, forcing the browser to decode every frame from the previous keyframe — 8192×4096 HEVC with ~6s GOPs stalls 2–3s per seek. PotPlayer feels instant because it snaps to keyframes. Now Kubby does the same for large sources:
- `src/lib/transcode/keyframe-index.ts` (new) — ffprobe demux-only keyframe scan (~1.7s for a 900MB file), cached in a globalThis map, keyed by file path; failed scans are evicted so transient errors don't poison the cache.
- `GET /api/movies/[id]/keyframes?disc=n` (new) — returns the source's keyframe timestamps.
- `use-playback-session.ts` — on direct-play start of a ≥3840px-wide source, the keyframe index loads in the background; `seekTo` snaps the target to the nearest keyframe (binary search). Sources below 4K keep precise seeking (fast enough, and snapping costs up to half a GOP of accuracy). Until the index arrives, seeks fall back to precise.

Measured on Jibaro 8K (browser seek-bar drags): first frame at target in **100–136ms** (was 900–2500ms), landing on the keyframe nearest the requested position (max drift ~1.6s with this file's ~6s GOPs).

### 3. Keyframe snap re-introduced the backward flick on Jibaro (follow-up to 1+2)
When the snap landed *before* the requested position (up to half a GOP), `timeupdate` immediately moved the bar back to the snapped time — same visual glitch as fix 1, different cause. Added a post-seek display hold (`displayHoldRef` + `reportTimeUpdate` in `use-playback-session.ts`): after an early-landing snap, the bar stays at the requested position until playback catches up, then resumes normally. `getRealTime()` (bookmarks, progress saves) still reports the true position. `skip()` on direct play now also routes through `seekTo` when a keyframe index is loaded, so double-tap skips snap too.

**First attempt had an 8s expiry on the hold** — if playback hadn't caught up by then (paused, or 8K still buffering after the seek), the hold expired and the bar slid backwards anyway (user-reported). The hold now has no time expiry: it releases only when playback reaches the requested position, or when the position drops below the snapped keyframe (an external seek invalidated it). Verified with a MutationObserver on the rendered bar width across overshoot-drag, rapid triple-scrub (incl. backward), and pause→drag→9s-wait→play: zero non-intentional backward movement; ABP-181 HLS path regression-checked smooth.

## 2026-07-03 (2): Playback performance & VR fixes — seek latency, black screen, over-under 360°, multi-disc media info

Fixed the remaining bugs from `docs/feature-request.md` (BUG-1, BUG-5, BUG-6, BUG-7, BUG-8) plus rmvb seek from BUG-4. All verified in-browser against the real-source test clips.

### Root causes (measured, not guessed)
- **MPEG-TS muxdelay**: FFmpeg's TS muxer offsets all timestamps by 1.4s by default. hls.js expects streams to start at 0 → decode misalignment after seek (black screen, BUG-7) and the `bufferAppendError` at playback start (BUG-5's second symptom). Fixed with `-muxdelay 0` (measured: segment start_time 1.433s → 0.033s).
- **Seek = full FFmpeg restart**: every seek killed the FFmpeg process, started a new session, and re-waited for playlist+segment with coarse polling (250ms server, 500ms client debounce, 500ms segment retry). Fixed by (a) client-side fast path — seek within the already-generated EVENT playlist range just sets `video.currentTime`, no server round-trip; (b) debounce 500→200ms, playlist poll 250→100ms, segment retry 500→200ms.
- **Encoder default GOP**: NVENC defaults to ~250-frame GOPs (8.3s @ 30fps) making segments oversized and seeks coarse. `-force_key_frames "expr:gte(t,n_forced*2)"` pins keyframes every 2s (transcode only; remux GOP is source-determined).
- **Over-under VR rendered as mono** (BUG-5): the 360° player mapped the full frame (both stereo eyes) onto the sphere. Added UV remapping to sample only the left eye for `ou` (top half) and `sbs` (left half) layouts.
- **WMV "slow" (BUG-8)**: transcode itself measured 17× realtime (fps≈510 NVENC) — the perceived slowness was entirely the seek-restart overhead above. No encoder change needed.
- **8K VR seek (BUG-6)**: Jibaro direct-plays (HEVC MP4); measured seek 0.9–2.5s is browser HEVC decode + range-fetch on a 60Mbps 8K stream, not Kubby pipeline. HLS-path improvements above apply when it's transcoded (e.g. resolution-capped playback); further gains would need pre-generated keyframe indexes (not pursued).
- **RMVB seek caveat (BUG-4)**: the rm demuxer cannot seek the test clip at all (input-side or output-side `-ss` both yield 0 frames; the 6MB clip's index points beyond its data). Playback from 0 works; seek restarts land on corrupt data. Full-file rmvb sources may behave better, but rmvb seeking is best-effort.

### Changes
- `src/lib/transcode/ffmpeg-command.ts` — `-muxdelay 0`; 2s forced keyframe cadence (was t=0 only)
- `src/lib/transcode/transcode-manager.ts` — playlist poll 250→100ms; MANAGER_VERSION bump
- `src/app/api/stream/[sessionId]/segment/[name]/route.ts` — segment wait 20×500ms → 50×200ms (same 10s budget, 2.5× finer)
- `src/hooks/use-playback-session.ts` — client fast-path seek within generated range (guarded against in-flight server seeks); server-seek debounce 500→200ms
- `src/components/player/panorama-360-player.tsx` — `layout` prop (`mono`/`ou`/`sbs`) with sphere UV remapping
- `src/components/player/player-controls.tsx` — VR layout picker (desktop chip menu + mobile overlay), shown only in 360° mode
- `src/app/(main)/movies/[id]/play/page.tsx` — vrLayout state, initialized from `userData.vrLayout`, persisted per movie on change
- `src/app/api/movies/[id]/user-data/route.ts` + `src/app/api/movies/[id]/route.ts` — read/write `vrLayout`
- `src/lib/db/schema.ts` + `src/lib/db/index.ts` — `user_movie_data.vr_layout` column (migration #0032)
- `src/components/movie/media-info-dialog.tsx` (BUG-1) — `discs` field in `MediaInfoData`; renders one file-info block per disc (file/container/format/size/bitrate/duration/codec/resolution) for multi-disc movies
- i18n: `player.vrLayout*` keys (en/zh)

### Measured results (browser, real seek-bar drags)
| Case | Before | After |
|---|---|---|
| ABP-181 mkv remux seek (BUG-7) | black screen | 147–305ms, correct frame |
| PSD-467 wmv2 transcode seek (BUG-8) | multi-second | 190–235ms |
| ETVCO-016 over-under 360° (BUG-5) | split/broken projection | correct with layout=上下 |
| Backward seek to pre-session range | full restart always | instant if in range, ~1.5s restart otherwise |

## 2026-07-03: Bug fixes — bookmark ordering, delete redirect, rmvb scanning

Fixed three bugs surfaced during test-environment setup (see `docs/feature-request.md` for the remaining open bugs).

### BUG-3: Bookmark ordering now disc-first
- `src/app/api/movies/[id]/bookmarks/route.ts`: list query ordered by `timestampSeconds` only, so multi-disc bookmarks interleaved across discs. Changed to `.orderBy(asc(discNumber), asc(timestampSeconds))` — disc-first, then timeline. Verified with cross-disc bookmarks on PSD-467 (disc1@10 → disc1@30 → disc2@5 → disc2@10).

### BUG-2: Delete redirect preserves library filter
- `src/app/(main)/movies/[id]/page.tsx`: `deleteMovie` onSuccess hard-coded `router.push("/movies")`, dropping the library filter and showing all libraries. Now `router.push(movie?.mediaLibraryId ? \`/movies?libraryId=${movie.mediaLibraryId}\` : "/movies")`. Verified in browser: after delete, URL retains `?libraryId=…` and stays in the source library view.

### BUG-4: RMVB / RM videos now scanned
- `src/lib/scanner/index.ts:16`: `VIDEO_EXTENSIONS` lacked `.rmvb`/`.rm`, so RealMedia files were silently ignored by `findVideoFiles()`. Added both extensions. Verified: NADE-131.rmvb (rv40/cook) now ingests, playback-decider correctly routes it to `transcode` (h264_nvenc).
- Side fix: `tsconfig.json` `exclude` now includes `test-media` — MPEG-TS test clips (`.ts`) were being type-checked as TypeScript and breaking `tsc --noEmit`.

## 2026-03-22: Rating Dimension Management Enhancement

Upgraded rating dimension management from simple tag chips to a full managed list with rename, reorder, weighted average, and delete confirmation.

### New Files
- `src/app/api/settings/dimension-usage/route.ts` — GET endpoint returning count of records using a specific dimension (`?type=movie|person&name=xxx`), used for delete confirmation prompt

### Changes
- **Dimension list UI** (`ratings-bookmarks/page.tsx`): Tag chips replaced with ordered list. Each row shows: sequence number, dimension name, weight stepper (x0.5–x3.0), up/down move buttons, rename (pencil), delete (trash). Column headers (Name / Weight) label each section. Action buttons always visible (mobile-friendly, no hover-only).
- **Inline rename**: Click pencil icon to enter edit mode (input replaces label), Enter confirms, Esc cancels. Tracks rename chain for unsaved multi-renames. On save, batch updates all `dimensionRatings` JSON keys via application-level read-modify-write.
- **Reorder**: Up/down arrow buttons swap array positions. Array order = display order in StarRatingDialog. No backend change needed (only array order matters).
- **Delete with confirmation**: Glass-style modal shows usage count ("will clear ratings from N movies/people"). Queries original name (pre-rename) when dimension was renamed but not yet saved.
- **Dimension weights**: New `movie_dimension_weights` / `person_dimension_weights` columns in `user_preferences` (migration #0031). Weight stepper per dimension (x0.5 to x3.0, step 0.5, default x1.0). Non-default weights highlighted in primary color.
- **Weighted average**: `computeAverage()` in `StarRatingDialog` changed from `sum/count` to `sum(rating×weight)/sum(weight)`. Weights passed from movie/person detail pages via `dimensionWeights` prop.
- **Batch recalculation**: On preferences save, all existing `personalRating` values recalculated using current weights and dimensions. Ensures ratings stay in sync when weights change.
- **Rename data migration**: PUT `/api/settings/personal-metadata` accepts `renamedDimensions: { movie?: {old: new}, person?: {old: new} }`. Reads all user's rating records, renames JSON keys in-memory, writes back. Scores preserved.
- **i18n**: Added `dimName`, `dimWeight`, `deleteDimensionTitle`, `deleteDimensionConfirm`, `deleteDimensionNoData`, `deleteDimensionLoading`, `movies`, `people` keys to `personalMetadata` namespace. Added `common.delete`. Updated dimension descriptions to mention weighted average.

### DB Schema
- `user_preferences.movie_dimension_weights` (text, JSON object)
- `user_preferences.person_dimension_weights` (text, JSON object)

## 2026-03-21: Metadata Center MVP

Expanded `/metadata/scraper` page from a simple API key config into a full Metadata Center with incomplete metadata browser and NFO writeback toggle.

### New Files
- `src/app/api/metadata/incomplete/route.ts` — GET endpoint querying movies/people with missing metadata (overview, date, photo filters, pagination)
- `src/app/api/settings/nfo-writeback/route.ts` — GET/PUT for global NFO writeback toggle (settings table key-value)

### Changes
- **Scraper page** → Metadata Center: Settings card (TMDB key + NFO writeback toggle) + Incomplete Metadata browser (Movies/People tabs, filter chips, card grid with missing field badges, Load More pagination)
- **Movie PUT**: checks `nfo_writeback_enabled` setting before writing NFO (in addition to existing `jellyfinCompat` check)
- **Nav sidebar**: renamed "Scraper" to "Metadata" (en/zh)
- **i18n**: 8 new keys in `dashboard` namespace (nfoWriteback, incompleteMetadata, missingOverview, etc.)

### Reused Components
- `MovieCard` and `PersonCard` rendered in responsive grid with missing field amber badges below
- Card dropdown menus open existing `MovieMetadataEditor` / `PersonMetadataEditor` dialogs
- Refresh button invalidates query cache for data freshness after edits

## 2026-03-17: Basic 360° Panoramic Player (Phase 2)

Implemented Three.js-based 360° panoramic video player with mouse/touch drag rotation and scroll zoom.

### New Files
- `src/components/player/panorama-360-player.tsx` — Three.js sphere renderer with VideoTexture, pointer drag rotation, scroll wheel FOV zoom

### Changes
- **page.tsx**: Dynamic import of Panorama360Player (SSR: false), conditionally rendered when 360° mode is on. Video element hidden but stays in DOM for HLS/playback.
- **Bundle**: three.js code-split into separate ~500KB chunk, lazy-loaded only when 360 mode is activated

### Features
- Inverted sphere geometry with BackSide material for equirectangular projection
- Mouse/touch drag to rotate camera (Pointer Events, works on mobile)
- Scroll wheel FOV zoom (30°–120°)
- Drag vs click detection (dragging doesn't trigger play/pause)
- ResizeObserver for responsive canvas
- Proper cleanup on unmount (dispose all Three.js resources)
- Render loop runs continuously for smooth VideoTexture updates

## 2026-03-17: VR/360 Player Mode Toggle (Phase 1)

Added player-level 360° mode toggle that persists per user.

### Changes
- **DB**: Added `player_360_mode` to `user_preferences` table (migration #0023)
- **User Preferences API**: GET/PUT `/api/settings/personal-metadata` supports `player360Mode`
- **Player Controls**: 360° toggle button in the bottom control bar, persists state via user preferences
- **i18n**: Added player.mode360/mode360On/mode360Off keys (en/zh)

### Design Decision
360° mode is a player-level toggle (not per-movie). Users enable/disable it themselves in the player controls. No automatic detection needed — avoids false positives and keeps the implementation simple.

## 2026-03-17: Player Refactoring for VR/360 Support (Phase 0)

Refactored the 1370-line monolithic player page into focused, reusable modules. Pure refactoring with zero behavior change, preparing for future VR/360 panoramic player that will share HLS session management, playback controls, bookmarks, and progress saving.

### New Files
- `src/hooks/use-playback-session.ts` — HLS/direct-play lifecycle, seek (debounced), heartbeat, cleanup, resolution change
- `src/hooks/use-progress-save.ts` — Auto-save interval (10s) + on-demand save mutation
- `src/components/player/player-controls.tsx` — Bottom control bar (seek bar, transport, volume, speed, resolution, fullscreen, bookmark markers)
- `src/components/player/player-overlays.tsx` — OSD message, Help modal, Bookmark panel, Center play button
- `src/components/player/player-top-bar.tsx` — Back button, title, disc counter, help toggle

### Modified Files
- `src/app/(main)/movies/[id]/play/page.tsx` — Slim orchestrator (487 lines, down from 1370): data fetching, hook wiring, keyboard shortcuts, controls visibility, bookmark mutations
- `docs/architecture-v0.2.md` — Updated directory structure to reflect new player modules

## 2026-03-15: Favorite Actors Feature

Added person/actor favoriting support and redesigned both Favorites tabs (Home + Movies page) to show favorite movies and favorite actors as separate ScrollRows.

### Changes
- **DB**: Added `is_favorite` column to `user_person_data` table (migration #0022)
- **API**: `GET/PUT /api/people/[id]/user-data` handles `isFavorite`; `/api/people` supports `filter=favorites` and returns `isFavorite` field
- **PersonCard**: Heart toggle button on hover overlay (left side), matching MovieCard pattern
- **Person Detail Page**: Heart button in badges row between rating/fanart buttons
- **Movies Page Favorites Tab**: Redesigned to show two ScrollRows (Favorite Movies + Favorite Actors) with clickable titles navigating to full grid views (`?view=movies` / `?view=actors`) with back navigation
- **Home Page Favorites Tab**: Two ScrollRows with clickable titles linking to Movies page grid views
- **i18n**: Added keys for `favoriteMovies`, `favoriteActors`, `noFavoriteActors` in en/zh

### Key Files Modified
- `src/lib/db/schema.ts`, `src/lib/db/index.ts` — schema + migration
- `src/app/api/people/[id]/user-data/route.ts` — isFavorite in GET/PUT
- `src/app/api/people/route.ts` — filter=favorites, isFavorite in response
- `src/app/api/people/[id]/route.ts` — isFavorite in userData
- `src/components/people/person-card.tsx` — Heart toggle props
- `src/app/(main)/people/[id]/page.tsx` — Heart button + toggleFavorite mutation
- `src/app/(main)/movies/page.tsx` — FavoritesOverview, FavoritesMoviesGrid, FavoritesActorsGrid; togglePersonFavorite in usePersonMutations
- `src/app/(main)/page.tsx` — Two ScrollRows in Favorites tab
- `src/i18n/messages/en.json`, `src/i18n/messages/zh.json`

## 2026-03-15: v0.2.3 — Cinema Indigo & Fluid Glass Visual Upgrade

Comprehensive visual overhaul with Cinema Indigo + Gold color scheme (`#6366f1` / `#ca8a04`) and fluid glassmorphism design system.

### Changes
- **Color scheme**: replaced all blue with Cinema Indigo + Gold tokens
- **Glass utilities**: `.glass-cinema`, `.glass-badge`, `.glass-btn`, `.glass-card` in `globals.css`
- **Glass treatment**: applied to nav sidebar, sort/filter dropdowns, detail page info panels
- **Backdrop-filter blur**: detail page glass panels use Tailwind `backdrop-blur-[20px]` (not `.glass-cinema` CSS class — Tailwind v4 specificity issue)
- **Tab bar**: unified with header background color (`var(--header)`) — no black band
- **Border-radius hierarchy**: inputs `rounded-md` → buttons `rounded-lg` → cards `rounded-xl`
- **Card dropdown fix**: tracked `menuOpen` state, opacity fade overlay, `modal={false}` on Radix DropdownMenu
- **HLS iOS Safari fix**: transcoded streams play beyond 6-7s
- **LAN access fix**: removed hardcoded `AUTH_URL=localhost`

### Key Files Modified
- `src/app/globals.css` — glass utilities, animations (fadeInUp, fadeIn, irisOpen, stagger-children)
- `src/app/(main)/movies/page.tsx` — glass pill sort/filter buttons, glass dropdown menus
- `src/app/(main)/movies/[id]/page.tsx` — backdrop-blur detail panel
- `src/app/(main)/people/[id]/page.tsx` — same as movie detail
- `src/components/movie/movie-card.tsx` — menuOpen state tracking, opacity fade overlay
- `src/components/people/person-card.tsx` — same pattern as movie-card

## 2026-03-02: Bookmark Mode (Frame Scrubber)

Lightweight frame browser on the movie detail page for creating bookmarks without video playback. Solves the problem of VR videos being too heavy for real-time FFmpeg transcoding.

### New Files
- `src/app/api/movies/[id]/frame/route.ts` — Frame extraction API (`GET ?t=SECONDS&disc=N&maxWidth=W`), uses `ffmpeg -ss` for fast keyframe seek, 10s timeout, 960px default max width
- `src/components/movie/frame-scrubber.tsx` — Self-contained client component with progress bar (click/drag), frame preview, bookmark creation UI (icon selector, tags, note)

### Modified Files
- `src/app/(main)/movies/[id]/page.tsx` — Added BookmarkPlus button in action row, conditional FrameScrubber panel between hero and content sections
- `src/i18n/messages/en.json` / `zh.json` — Added bookmarkMode, scrubberLoading, scrubberDragHint, closeScrubber keys

### Key Behaviors
- Progress bar: click = instant frame fetch, drag = 300ms debounced fetch
- Frame display: `<img>` with browser caching for repeated URLs
- Bookmark markers: colored dots on progress bar matching existing player seek bar pattern
- Bookmark creation: fetches frame blob as thumbnail, POSTs FormData to existing bookmarks API
- Multi-disc support: disc tab selector, per-disc runtime and bookmarks
- Button hidden when movie has no runtimeSeconds

## 2026-03-01: Play Always Starts From Beginning
- Play button on movie detail page now passes `?t=0` to always start playback from beginning
- No resume button needed — users can use bookmarks to jump to specific positions

## 2026-03-01: Auth Redirect Fixes & Sort/Filter State Persistence

### Sign Out Redirect Fix
- `signOut()` in nav-sidebar now passes `{ callbackUrl: "/login" }` explicitly, preventing redirect to `0.0.0.0:3000`

### Login Redirect Fix
- Login form now sanitizes `callbackUrl` to pathname-only, stripping any absolute URL with `0.0.0.0` host that middleware may inject

### Sort/Filter State Persistence
- Movies page sort (field, order, dimension) and filter (genres, tags, years) state now synced to URL search params
- Active tab (movies/favorites/genres/actors) persisted in URL `tab` param
- Navigating to movie detail and back preserves all sort/filter/tab selections
- State initialized from URL params on mount; changes written back via `router.replace`

## 2026-03-01: UI Polish — Entrance Animations, Card Tiers, Typography

Visual refinement pass across all utility and content pages to match the cinematic quality of the main browsing experience.

### Global (globals.css)
- `stagger-children` CSS class: children fade-in with 50ms stagger delays
- `animate-fade-in-up` / `animate-slide-in-right` / `animate-slide-in-left` keyframe animations
- `brand-glow` pulsing text-shadow for Kubby logo
- Enhanced input focus states: blue glow ring + background shift (applies globally)
- `card-hover` class: translateY lift + border brighten on hover
- `button:active` scale-down feedback (0.98)

### Setup Wizard
- Slide left/right animations between steps based on navigation direction
- Progress dots replaced with numbered step indicators + check icons + connecting lines
- Brand glow on Kubby logo across all steps

### Auth Pages (Login, Register)
- Card fade-in-up animation on mount
- Brand glow on Kubby logo

### Dashboard
- Stat cards: elevated card surface (`bg-white/[0.03]` + shadow), `tabular-nums` for values
- Section headings: icon + gradient divider line pattern
- Activity rows: hover highlight
- Quick action buttons: subtle bg + hover lift
- All sub-pages (Users, Scraper, Networking, Libraries): `stagger-children` entrance, `text-3xl tracking-tight` titles, elevated card surfaces

### Admin Sidebar
- Rounded nav items with padding
- Active state: gradient background (`from-primary/12 to-transparent`) + rounded pill indicator
- Gradient divider below section label
- Smooth hover transition on items

### User Settings, Card Badges, Personal Metadata
- `stagger-children` entrance animations
- Elevated card surfaces with shadow
- Avatar glow ring on settings page
- `tracking-tight` on section headings

### Content Pages
- Home page: stagger-fade on ScrollRow sections
- Movie browse: fade-in-up on grid containers (first load only, not on infinite scroll)
- Genres tab: stagger-fade on genre rows
- Favorites tabs: fade-in-up on grids

### Detail Pages (Movie, Person)
- Hero content (poster + info overlay): fade-in-up
- Sections below hero (discs, bookmarks, cast, recommended, filmography, gallery): stagger-fade

### Modified Files
- `src/app/globals.css` — animation keyframes, input focus, card-hover, button feedback
- `src/app/(setup)/setup/setup-wizard.tsx` — step transitions, progress indicator
- `src/app/(auth)/login/login-form.tsx`, `src/app/(auth)/register/page.tsx` — entrance animation
- `src/app/(main)/dashboard/page.tsx` — stat cards, section headings, quick actions
- `src/app/(main)/dashboard/users/page.tsx`, `scraper/page.tsx`, `networking/page.tsx`, `libraries/page.tsx` — stagger + card tiers
- `src/app/(main)/settings/page.tsx` — avatar glow, card tiers
- `src/app/(main)/card-badges/page.tsx`, `personal-metadata/page.tsx` — stagger + card tiers
- `src/app/(main)/page.tsx` — home row stagger, favorites fade-in
- `src/app/(main)/movies/page.tsx` — grid fade-in, genres stagger
- `src/app/(main)/movies/[id]/page.tsx` — hero fade-in, sections stagger
- `src/app/(main)/people/[id]/page.tsx` — hero fade-in, sections stagger
- `src/components/layout/admin-sidebar.tsx` — redesigned nav items

---

## 2026-03-01: Hardware-Accelerated Transcoding + HLS Improvements

End-to-end overhaul of the streaming pipeline: hardware encoder auto-detection, resolution selection, HLS-aware seeking, and session lifecycle hardening.

- **hw-accel.ts**: auto-detect VideoToolbox (macOS) / NVENC (NVIDIA) / libx264 (CPU) with runtime fallback if HW encoder fails
- **Player HW/SW badge**: green "HW" / dim "SW" indicator with encoder detail popover
- **Resolution selector**: 原画 (original) / 1080p / 720p / 480p with smart filtering by source width; 1080p cap for transcoding
- **Decide API**: returns `videoWidth` and `durationSeconds`; `maxWidth` param flows through decide → FFmpeg pipeline (maxWidth=0 skips scale)
- **HLS-aware seeking**: `seekTo`, `hlsTimeOffsetRef`, `getRealTime`, destroy+recreate HLS instance on seek; 500ms debounce + AbortController on client seeks
- **Backend duration for progress bar**: fixes HLS.js reporting only 6-8s of duration
- **PATCH heartbeat** on `/api/stream/[sessionId]` (30s keepalive)
- **Session lifecycle tuning**: idle timeout 10min→90s, cleanup interval 60s→15s, SIGKILL fallback 2s after SIGTERM
- **Encoding performance**: ultrafast preset + threads 0 for faster SW encoding
- **Bug fixes**: seek race condition (stopLoad before seek, play after loadSource, skip error recovery during seek); progress bar jump and video freeze during seek (hlsSeekingRef flag); stale globalThis singleton after dev hot-reload (version key)

---

## 2026-03-01: Movie Browser Sort Options

- Added file size sorting option to movies API and browser UI
- Added resolution sorting option to movies API and browser UI

---

## 2026-03-01: Empty Home Page Library Card

- New `AddLibraryCard` component: dashed-border card in Media Libraries scroll row when no libraries exist
- Clicking the card opens the Add Library dialog inline

---

## 2026-03-01: Back/Home Navigation Buttons

- Added back and home buttons to the app header on 6 pages for improved navigation

---

## 2026-03-01: Non-Admin Dashboard Protection

- Hide Administration section from non-admin users in the nav sidebar
- Redirect non-admin `/dashboard` access to `/` instead of `/login`

---

## 2026-03-01: Complete Admin User Management System

Full CRUD user management for administrators with role management and security protections.

### New Files
- `src/app/api/users/[id]/route.ts` — DELETE (admin delete user) and PUT (admin update role/reset password) endpoints

### Modified Files
- `src/app/api/users/route.ts` — Added admin auth check to GET, restricted POST to admin-only after first user, accept `isAdmin` field from admin callers
- `src/app/(main)/dashboard/users/page.tsx` — Full rewrite from read-only list to management page with Add User, Delete, Role Toggle, and Reset Password dialogs
- `src/i18n/messages/en.json` — Added 18 dashboard user management translation keys
- `src/i18n/messages/zh.json` — Added corresponding Chinese translations

### Key Features
- **Admin create user**: Dialog with username, password, display name, admin toggle
- **Delete user**: Confirmation dialog with cascade warning (ratings, bookmarks, watch history)
- **Toggle admin role**: Click role badge to promote/demote users
- **Reset password**: Admin can set new password for any user
- **Last-admin protection**: Cannot demote or delete the sole administrator
- **Self-delete prevention**: Admin cannot delete their own account
- **Closed registration**: Public registration locked after first user; only admins can create users
- **API authorization**: GET /api/users and POST /api/users require admin auth (except first-user setup)

---

## 2026-03-01: Hardware-Accelerated Transcoding (VideoToolbox + NVENC + Fallback)

Auto-detects and uses the best available hardware encoder for HLS transcoding with zero configuration.

### Encoder Priority
- **h264_videotoolbox** (macOS Apple Silicon) — 3-10x faster than CPU
- **h264_nvenc** (NVIDIA GPU with CUDA) — GPU-accelerated encoding
- **libx264** (CPU fallback) — unchanged behavior for systems without hardware encoders

### New Files
- `src/lib/transcode/hw-accel.ts` — encoder detection (`ffmpeg -encoders` + `-hwaccels` parsing), encoder config types, libx264 fallback config

### Modified Files
- `src/lib/transcode/ffmpeg-command.ts` — accepts `EncoderConfig`, branches on encoder for `-hwaccel`, `-c:v`, quality args; only adds `-threads 0` for libx264
- `src/lib/transcode/transcode-manager.ts` — lazy encoder detection cached in singleton, runtime fallback (hardware fail → retry with libx264, `retriedWithSoftware` flag prevents loops)
- `src/app/api/movies/[id]/stream/decide/route.ts` — returns `encoder` field in HLS response
- `src/app/(main)/movies/[id]/play/page.tsx` — green "HW" / dim "SW" badge next to time display (hover shows encoder name), only visible during remux/transcode

### Key Design Decisions
- Detection runs once on first transcode, cached for process lifetime
- Runtime fallback: if hardware encoder FFmpeg exits non-zero, transparently restarts with libx264 (same session ID, no client disruption)
- All encoders use CPU `scale` filter for 1080p downscale (hardware scale filters add complexity without meaningful gain at this resolution)

---

## 2026-02-28: HLS Transcoding for Universal Video Playback

FFmpeg converts incompatible video formats to HLS on-demand. Browser-compatible formats keep direct play.

### Decision Logic
- **Direct play**: MP4+H.264+AAC, WebM+VP8/VP9+Opus/Vorbis
- **Remux** (copy streams to HLS): browser-compatible codec but wrong container (MKV/MOV/TS with H.264)
- **Transcode** (re-encode to H.264+AAC): incompatible codecs (mpeg4, wmv2, flv1, etc.)

### New Files
- `src/lib/transcode/playback-decider.ts` — pure function deciding direct/remux/transcode
- `src/lib/transcode/ffmpeg-command.ts` — builds FFmpeg HLS command arguments
- `src/lib/transcode/transcode-manager.ts` — singleton managing FFmpeg child processes (session lifecycle, idle cleanup, graceful shutdown via globalThis pattern)
- `src/app/api/movies/[id]/stream/decide/route.ts` — decide endpoint
- `src/app/api/stream/[sessionId]/playlist.m3u8/route.ts` — HLS playlist serving
- `src/app/api/stream/[sessionId]/segment/[name]/route.ts` — HLS segment serving
- `src/app/api/stream/[sessionId]/route.ts` — session management (seek/stop)

### Modified Files
- `src/lib/paths.ts` — added getFfmpegPath(), getTranscodeCacheDir()
- `src/lib/scanner/index.ts` — added .ts to VIDEO_EXTENSIONS
- `src/app/api/movies/[id]/stream/route.ts` — added .flv and .ts MIME types
- `src/app/(main)/movies/[id]/play/page.tsx` — HLS.js integration with decide-then-play pattern
- `launcher/server.go` — added resolveFfmpegBin() and FFMPEG_PATH env var
- `scripts/package.ts` — added ffmpeg binary download for all platforms

### New Dependency
- `hls.js` — HLS playback in browsers

### Key Design Decisions
- Transcode temp files in `os.tmpdir()/kubby-transcode/` (ephemeral, OS clears on reboot)
- 10-minute idle session cleanup, graceful shutdown kills all FFmpeg processes
- FFmpeg unavailable → graceful fallback to direct play with warning
- HLS.js handles playback; Safari uses native HLS via `video.src`
- Session cleanup on unmount + beforeunload for reliable cleanup

---

## 2026-02-12: 5 Jellyfin-Inspired UI Features

### F1: Movie Card Hover Play Button
- Centered Play circle icon appears on poster hover (z-index between poster and bottom overlay)
- Hovering the play icon scales it up (1.25×) and changes background to primary color
- Clicking the play button navigates directly to `/movies/${id}/play` (bypasses detail page)
- Uses `e.preventDefault()` + `e.stopPropagation()` to prevent Link navigation

### F2: ScrollRow Inline Arrows on Home Page
- Home page MovieRow and Media Libraries sections now pass `title` prop to `<ScrollRow>`
- This activates the inline left/right arrow mode (title row with nav buttons) instead of floating overlay arrows
- Removed external `<h2>` wrappers, letting ScrollRow handle the title

### F3: Library Card Redesign
- Library card now shows a fanart cover image (320×180) fetched from a random movie in the library
- Falls back to Film/Folder icon if no cover image available
- Text (name + movie count) displayed below card, centered
- Dropdown menu updated: Scan Library, Refresh Metadata, Edit Metadata, Edit Image, Delete
- API: Added `coverImage` subquery to `GET /api/libraries` response
- i18n: Added `editMetadata`, `editImage` to home namespace (EN/ZH)

### F4: Hamburger Sidebar Navigation
- New `NavSidebar` component: slide-out drawer from the left
- Backdrop with blur, closes on click or ESC key
- Sections: Home, Media (Movies), Administration (Dashboard, Metadata Manager), User (Settings, Sign Out)
- Active state highlighting with `bg-primary/10 text-primary`
- Hamburger `<Menu>` icon button added at far left of header
- i18n: Added `media`, `administration`, `metadataManager`, `user` to nav namespace (EN/ZH)

### F5: Centered Sort & Filter Toolbar
- New `GET /api/libraries/[id]/filters` endpoint returns `{ genres, years }` for a library
- Movies API: Added `sortOrder` (asc/desc), `genres` (comma-separated, OR logic), `years` (comma-separated) params
- Movies page toolbar: two centered icon buttons (Sort By + Filter)
- Sort dropdown: field radio options + ascending/descending radio
- Filter dropdown: collapsible Genres and Years sections with checkboxes, active filter count badge, "Clear All" button
- i18n: Added `sortOrder`, `ascending`, `descending`, `filter`, `clearFilters` to movies namespace (EN/ZH)

## 2026-02-12: Hover Action Menus for Library Cards & Movie Cards

### Library Card hover menu
- Hover → ⋯ button (bottom-right) → Dropdown with: Scan Library, Refresh Metadata, Edit, Delete
- Scan Library triggers `POST /api/libraries/${id}/scan` and invalidates queries
- Delete shows confirmation dialog, then calls `DELETE /api/libraries/${id}`
- Refresh Metadata / Edit are placeholder alerts

### Movie Card hover actions
- Hover → bottom overlay bar with: ✓ Watched toggle (left), ❤️ Favorite toggle (right), ⋯ Dropdown (right)
- Dropdown items: Play, Edit Metadata, Media Info, Refresh Metadata, Delete
- Play navigates to `/movies/${id}/play`
- Delete shows confirmation dialog, then calls `DELETE /api/movies/${id}`
- Edit Metadata / Media Info / Refresh Metadata are placeholder alerts
- Added `DELETE /api/movies/[id]` API endpoint with auth check

### Additional polish
- Frosted glass (backdrop-blur) dropdown background
- Person card name/role moved below poster (Jellyfin style)
- Card text labels centered
- Card border-radius set to 4px
- Removed static favorite heart badge from movie card poster
- Header height reduced (h-16 → h-12)
- Transparent header on person detail page
- EN/ZH i18n strings for all action labels

## 2026-02-14: TMDB Scraper for Automatic Movie Metadata

### Core scraper infrastructure
- New `settings` table (key-value) for centralized configuration (e.g. TMDB API key)
- New `scraper_enabled` column on `media_libraries` table
- Drizzle migration: `drizzle/0002_familiar_scarecrow.sql`

### TMDB client expansion (`src/lib/tmdb.ts`)
- `searchMovie(query, year, apiKey)` - search TMDB for movies
- `getMovieDetails(tmdbId, apiKey)` - full details with credits in one call
- `downloadTmdbImage(tmdbPath, destPath, size)` - download poster/backdrop/profile images
- `validateApiKey(apiKey)` - test TMDB API key validity
- Image size constants: `TMDB_POSTER_SIZE` (w500), `TMDB_BACKDROP_SIZE` (w1280), `TMDB_PROFILE_SIZE` (w185)

### NFO generator (`src/lib/scanner/nfo-writer.ts`)
- `writeFullNfo(nfoPath, data)` - generates complete Kodi/Jellyfin-compatible `movie.nfo`
- Supports: title, originalTitle, plot, tagline, rating, runtime, premiered, year, genres, studios, country, uniqueid (tmdb/imdb), actors (with thumb), directors

### Scraper module (`src/lib/scraper/`)
- `folder-parser.ts` - parses "Inception (2010)" into `{ title, year }`
- `index.ts` - `scrapeMovie()` orchestrates: search → details → download images → generate NFO
- Downloads poster.jpg, fanart.jpg to movie dir; actor photos to `data/metadata/people/{Letter}/{Name}/`
- 250ms rate limiting between TMDB API calls

### Scanner integration (`src/lib/scanner/index.ts`)
- Scraper runs as pre-processing step: if no `movie.nfo` and scraper enabled, scrape from TMDB first
- Then existing NFO parse + DB import flow handles everything unchanged
- Falls back gracefully on scrape failure (log warning, skip)

### Dashboard scraper settings page (`/dashboard/scraper`)
- API key input with show/hide toggle
- Save validates key against TMDB API before storing
- Status indicators: configured (green check), saved, invalid (red X)
- Help text with link to get TMDB API key

### Library creation UI update (`/dashboard/libraries`)
- "Enable metadata scraper" checkbox in Add Library dialog
- Warning hint when scraper enabled but no TMDB API key configured, with link to settings

### Admin sidebar
- Added "Scraper" nav item with Search icon

### i18n (EN + ZH)
- 10 new keys in `dashboard` namespace: scraperSettings, metadataProviders, tmdbApiKey, tmdbApiKeyHelp, apiKeySaved, apiKeyInvalid, enableScraper, scraperApiKeyMissing, configureApiKey, scraping

## 2026-02-18: Metadata Editing (Movie + Person)

### Movie metadata editor
- Three-dot (⋮) menu on movie detail page with: Edit Metadata, Edit Images, Edit Subtitles, Identify, Media Info, Refresh Metadata, Delete Media (non-edit items are placeholders)
- `MovieMetadataEditor` dialog component with two tabs: General and External IDs
- General tab: Title, Original Title, Sort Title, Overview (textarea), Tagline, Year, Premiere Date, Runtime, Community Rating, Official Rating, Country, Genres (tag input with Enter-to-add), Studios (tag input)
- External IDs tab: TMDB ID, IMDB ID
- `PUT /api/movies/[id]` endpoint: updates DB fields, regenerates NFO file via `writeFullNfo()`
- NFO writer updated to support `sortTitle` field
- Movie card "Edit Metadata" dropdown item now opens the editor dialog instead of placeholder alert

### Person metadata editor
- Three-dot (⋮) menu on person detail page with: Edit Metadata
- `PersonMetadataEditor` dialog component with two tabs: General and External IDs
- General tab: Name, Type (select: actor/director/writer/producer), Biography (textarea), Birth Date, Birth Year, Place of Birth, Death Date
- External IDs tab: TMDB ID, IMDB ID
- `PUT /api/people/[id]` endpoint: updates person record in DB
- Extended `people` table schema with new columns: overview, birth_date, birth_year, place_of_birth, death_date, imdb_id, date_added
- Drizzle migration: `drizzle/0003_metadata_editing.sql`

### UI components
- New `Textarea` component (`src/components/ui/textarea.tsx`) matching shadcn/Input styling

### i18n (EN + ZH)
- New `metadata` namespace with 34 keys: editMetadata, general, externalIds, title, originalTitle, sortTitle, overview, tagline, year, premiereDate, runtime, runtimeMinutes, communityRating, officialRating, country, genres, studios, addGenrePlaceholder, addStudioPlaceholder, name, type, actor, director, writer, producer, biography, birthDate, birthYear, placeOfBirth, deathDate, saving, editImages, editSubtitles, identify, deleteMedia

## 2026-02-19: Personal Metadata Settings & Multi-Dimensional Ratings

### Database schema changes
- New `user_preferences` table: userId (unique), movieRatingDimensions (JSON), personRatingDimensions (JSON), showMovieRatingBadge (bool), showPersonTierBadge (bool)
- New `dimension_ratings` (JSON text) column on both `user_movie_data` and `user_person_data` tables
- Stores per-dimension scores (e.g. `{"剧情": 9.5, "特效": 8.0}`)

### Preferences API (`/api/settings/personal-metadata`)
- GET: Returns user preferences (dimensions arrays, badge toggles) with defaults
- PUT: Upserts preferences with validation (max 10 dimensions per type)

### Client-side hook (`src/hooks/use-user-preferences.ts`)
- `useUserPreferences()` hook with React Query caching (5 min staleTime)
- Shared across all card/rating components via query key deduplication

### Personal Metadata settings page (`/personal-metadata`)
- Movie Rating Dimensions section: tag-input (chips + Enter-to-add), max 10
- Person Rating Dimensions section: same tag-input pattern, max 10
- Card Badge Settings section: two toggle switches for movie rating badge and person tier badge
- Save button persists all settings, invalidates cached preferences

### Multi-dimensional star rating dialog
- When dimensions configured: shows vertically stacked dimension rows, each with 5 smaller stars (h-6 w-6) + fine-tune buttons + numeric display
- Computed "Overall" average displayed as read-only below dimension rows
- When no dimensions: existing single-rating behavior unchanged
- Dialog width adapts: 480px for dimensions mode, 340px for single mode

### Metadata editors updated
- Movie metadata editor: Personal tab shows per-dimension number inputs when movieRatingDimensions configured
- Person metadata editor: Personal tab shows per-dimension star rows when personRatingDimensions configured
- Both compute personalRating as average of dimension values on save

### Card badge visibility
- MovieCard: respects `showMovieRatingBadge` preference (when false, falls through to community rating)
- PersonCard: respects `showPersonTierBadge` preference (when false, hides tier badge)
- PersonCard converted to client component with `"use client"` directive

### Detail pages updated
- Movie detail page: passes dimensions and dimensionRatings to StarRatingDialog
- Person detail page: passes dimensions and dimensionRatings to StarRatingDialog
- Both savePersonalRating functions send dimensionRatings alongside personalRating

### User-data APIs updated
- Movie and person user-data GET: parse and return dimensionRatings from JSON
- Movie and person user-data PUT: accept and store dimensionRatings
- Movie and person detail GET: include dimensionRatings in userData response

### Sidebar navigation
- Added "Personal Metadata" link (SlidersHorizontal icon) under Media section

### i18n (EN + ZH)
- New `nav.personalMetadata` key
- New `personalMetadata` namespace with 14 keys: title, movieRatingDimensions, movieRatingDimensionsDesc, personRatingDimensions, personRatingDimensionsDesc, addDimensionPlaceholder, cardBadgeSettings, showMovieRatingBadge, showMovieRatingBadgeDesc, showPersonTierBadge, showPersonTierBadgeDesc, saved, failedToSave, maxDimensions, overall

## 2026-02-19: Cast Editing & Actor Age at Release

### Cast editing in movie metadata editor
- New "Cast" tab in `MovieMetadataEditor` dialog between General and Personal tabs
- Each cast entry row: Name (text input), Type (select: actor/director/writer/producer), Role (text input), X remove button
- "Add Person" button with dashed border at bottom of list
- `PUT /api/movies/[id]` updated: when `cast` array provided, deletes existing `moviePeople` rows and re-inserts with proper sort order
- Person lookup: finds existing person by name+type, creates new record if not found
- `GET /api/movies/[id]` now returns `allPeople` array (all people for the movie, not filtered by type) for the editor

### Actor age at film release on person cards
- `GET /api/movies/[id]` cast query now includes `birthDate` from people table
- `PersonCard` component: new optional `age` prop displayed as third line below role
- `computeAgeAtRelease()` helper on movie detail page: calculates age from birthDate and premiereDate (or year as fallback with July 1 midpoint)
- Age hidden when birthDate or release date is missing

### i18n (EN + ZH)
- New `metadata` keys: cast (演职人员), role (角色), addCast (添加人员)

## 2026-02-19: Overview Truncation & Clickable Tags/Genres/Studios

### Overview truncation on movie detail page
- Added `line-clamp-4` to overview paragraph to limit to 4 lines with "..." overflow
- Prevents long overviews from misaligning the poster layout

### Clickable tags, genres, and studios
- Tags, genres, and studios on movie detail page are now `<Link>` components
- Clicking navigates to `/movies?libraryId=X&genre=Y` (or `&tag=` / `&studio=`)
- Hover effect: underline + brighter text color
- Added `mediaLibraryId` to `MovieDetail` interface (already returned by API)

### Filter params support on movies page
- Movies page reads `genre`, `tag`, `studio` from URL search params
- `genre` param pre-selects that genre in the filter state
- `tag` and `studio` params passed directly to the API query
- Query key includes URL filter params for proper cache invalidation

### API tag/studio filtering
- `GET /api/movies` now supports `tag` and `studio` query params
- Uses `like(movies.tags, ...)` and `like(movies.studios, ...)` matching (same pattern as existing `genre` filter)

### Header filter label
- When on `/movies` with `genre`, `tag`, or `studio` param, the header title shows "Library Name — FilterValue"

## 2026-02-20: Card Badge Settings — Preview Cards & Expandable Rule Descriptions

### Badge preview cards
- Movie Card Preview: abstract poster placeholders (gradient + film icon) at 120×180, showing "Enabled" (with active badges) and "Disabled" (no badges) side by side
- Person Card Preview: abstract poster placeholders (gradient + user icon) showing "Enabled" (with tier "S" badge) and "Disabled" side by side
- Previews react to toggle state: toggling resolution/rating/tier off removes that specific badge from the "Enabled" preview in real-time

### Expandable rule descriptions
- Resolution badge rules: clickable "View rules" chevron expands to show all width→label thresholds (8K through SD) in a two-column grid
- Tier badge rules: clickable "View rules" chevron expands to show all rating→tier thresholds (SSS through E) with each tier label styled in its actual color from `getTierColor()`

### i18n (EN + ZH)
- New `cardBadges` keys: badgeEnabled, badgeDisabled, viewRules, hideRules, resolutionRulesTitle, tierRulesTitle

## 2026-02-20: Library Scan Progress Display

### SSE streaming progress from scanner
- `scanLibrary()` now accepts optional `onProgress` callback with `{ current, total, title }` signature
- Progress is throttled to ~20 events max (every 5% boundary) regardless of library size, plus first and last item
- Directories are pre-counted for accurate total before scanning begins

### API converted to Server-Sent Events
- `POST /api/libraries/[id]/scan` now returns `text/event-stream` response
- Streams `data: {"current":N,"total":M}` events during scan
- Sends `data: {"done":true,"scannedCount":N}` on completion
- Sends `data: {"error":"..."}` on failure

### LibraryCard progress bar UI
- Scanning overlay now shows a `<Progress>` bar with "Scanning 5/120" text
- Falls back to "Scanning..." text before first progress event arrives
- SSE fetch + stream parsing handled directly in the component
- Prop changed from `onScan` to `onScanComplete` (just for query invalidation)

### Dashboard libraries page progress
- "Scan Now" button shows inline progress text "5/120" during scan
- Button disables across all libraries while a scan is in progress

### i18n (EN + ZH)
- New `home.scanProgress` key: "Scanning {current}/{total}" / "扫描中 {current}/{total}"

## 2026-02-21: Multi-Folder Support per Library + Checkbox Bug Fix

### Multi-folder support
- New `src/lib/folder-paths.ts`: `parseFolderPaths()` and `serializeFolderPaths()` helpers for backward-compatible JSON array storage in existing `folderPath` column (no DB migration needed)
- Scanner (`src/lib/scanner/index.ts`): iterates all folder paths, aggregates movie directories across all paths, skips missing paths with warning instead of failing
- `GET /api/libraries`: returns `folderPaths: string[]` alongside `folderPath`, poster.jpg lookup uses first path
- `POST /api/libraries`: accepts `folderPaths: string[]` (falls back to single `folderPath` for backward compat)
- `GET /api/libraries/[id]`: returns `folderPaths` array
- `PUT /api/libraries/[id]`: accepts `folderPaths: string[]`
- `POST/DELETE /api/libraries/[id]/cover`: uses first path for poster.jpg location
- `POST /api/setup/complete`: wraps single `folderPath` in `serializeFolderPaths([folderPath])`

### Multi-path edit UI
- LibraryCard edit dialog: shows list of existing paths with remove button (disabled when only 1 path), text input + "Add Folder" button to add new paths, Enter key support
- Dashboard "Add Library" dialog: same multi-path UI with folder picker integration
- Dashboard library cards: display all paths (one per line, monospace)
- Home page: passes `folderPaths` array to `LibraryCard` component

### Checkbox bug fix
- Removed `e.preventDefault()` from edit dialog's `DialogContent` onClick handler
- Dialog renders via Radix portal (outside `<Link>`), so `preventDefault` was unnecessary and actively blocked native checkbox toggle behavior

### i18n (EN + ZH)
- New `home.folderPaths`: "Folder Paths" / "文件夹路径"
- New `home.addFolder`: "Add Folder" / "添加文件夹"
- New `home.removeFolder`: "Remove Folder" / "移除文件夹"

## 2026-02-21: Actor List Page with Sort, Filter, Tags & Personal Rating

### New "Actors" tab on library browse page
- Fourth tab alongside Movies, Favorites, Genres on the `/movies?libraryId=` page
- Displays all people linked to movies in the current library as poster cards
- PersonCard rendered at movie-card size (180×270) with tier badges
- Click poster → navigates to person detail page

### Sort options
- Name (A–Z), Personal Rating, Date Added, Movie Count
- Ascending/descending toggle (defaults: asc for name, desc for others)

### Filter options
- Type: checkboxes for actor/director/writer/producer (populated from library data)
- Tags: checkboxes from people's tags in the library
- Tier: checkboxes for SSS through E + Unrated

### People tags support
- New `tags` column on `people` table (JSON array string, same pattern as movies)
- DB migration: `drizzle/0005_people_tags.sql` + auto-migration in `src/lib/db/index.ts`
- Person metadata editor: tag chips with X remove + text input with Enter-to-add in General tab
- `GET /api/people/[id]`: returns parsed `tags` array
- `PUT /api/people/[id]`: accepts `tags` array, stores as JSON

### New APIs
- `GET /api/people`: list people with filters (libraryId, search, sort, sortOrder, types, tags, tier, limit)
  - JOINs moviePeople → movies for library scoping, LEFT JOINs userPersonData for personal rating
  - Computes movieCount via COUNT(DISTINCT movie_id)
  - Tier filter applied in application code using getTier() thresholds
- `GET /api/libraries/[id]/people-filters`: returns available types and tags for people in the library

### PersonCard update
- New `"movie"` size option: 180×270 (matches MovieCard poster dimensions)

### i18n (EN + ZH)
- New `movies` keys: actors, noActors, actorsCount, nameAZ, movieCount, personalRating, type, allTypes, unrated, tier

## 2026-02-21: Person Photo Gallery Wall

### Gallery API (`/api/people/[id]/gallery`)
- `GET`: Lists gallery images from `{personDir}/gallery/` directory, filtered to image extensions (jpg, jpeg, png, webp), sorted by filename
- `POST`: Multi-file upload via FormData, auto-numbers files as `001.jpg`, `002.png` etc., creates `gallery/` subdirectory if needed
- `DELETE`: Removes a single gallery image by filename, validates against path traversal attacks
- Person directory derived from `photoPath` in DB or computed from person name using `sanitizePersonName()`

### Gallery section on person detail page (`/people/[id]`)
- "Photos" section below Filmography with count display and Upload button (ImagePlus icon)
- CSS grid layout with `repeat(auto-fill, 220px)` columns, 3:4 aspect ratio thumbnails with `object-cover`
- Hover effect: subtle scale-up + delete X button appears (top-right corner)
- Hidden file input triggered by Upload button, supports multiple file selection
- Refetches gallery query on successful upload or delete

### Lightbox viewer
- Full-screen fixed overlay with dark backdrop (`bg-black/90`)
- Centered image with `object-contain`, max 90vw × 90vh
- Left/right arrow buttons for navigation between images
- Keyboard support: Escape to close, arrow keys to navigate
- Click backdrop to close, click image to stay open

### i18n (EN + ZH)
- New `person` keys: photos (照片), photosCount (张照片), uploadPhotos (上传), deletePhoto (删除照片), noPhotos (暂无照片)

## 2026-02-21: Multi-Dimension Rating Sort

### Backend: People API dimension sort
- `GET /api/people`: new `sortDimension` query param
- When `sort=personalRating` + `sortDimension` provided: sorts by `json_extract(upd.dimension_ratings, '$."dimensionName"')` with COALESCE fallback to -1
- When `sort=personalRating` without `sortDimension`: existing behavior (sorts by `upd.personal_rating`)

### Backend: Movies API dimension sort
- `GET /api/movies`: new `sortDimension` query param
- When `sort=personalRating` + `sortDimension` provided: sorts by `json_extract(userMovieData.dimensionRatings, '$."dimensionName"')` via raw SQL order clause
- When `sort=personalRating` without `sortDimension`: existing behavior

### Frontend: Expandable sort dropdown
- All three sort dropdowns (`MoviesTabContent`, `PersonMoviesContent`, `ActorsTabContent`) updated:
  - If user has configured rating dimensions: "Personal Rating" sort option becomes expandable with chevron toggle
  - Expanding reveals: "Overall" (sorts by average personal_rating) + each dimension name as individual sort sub-items
  - If no dimensions configured: "Personal Rating" remains a flat, non-expandable sort item
  - Clicking a dimension sub-item sets `sort=personalRating` + `sortDimension=dimensionName` + auto-sets descending order
  - Active state highlighting on the specific selected sub-item
- `sortDimension` state included in React Query keys for automatic refetch on change
- Uses `useUserPreferences()` hook: `movieRatingDimensions` for movie tabs, `personRatingDimensions` for actors tab

### i18n (EN + ZH)
- New `movies.overall` key: "Overall" / "综合"

## 2026-02-22: Person Detail Fanart View, Person Card Edit Metadata, Tags UI Fix

### Person detail fanart view button
- Added `Maximize2` button in the person detail header badges area (matches movie detail behavior)
- When clicked, gradients and content overlay fade out (`opacity-0 pointer-events-none` with 300ms transition) to reveal full fanart background
- Click-to-dismiss overlay (`z-20 cursor-pointer`) restores normal view
- Button only appears when `fanartPath` exists on the person

### Person card "Edit Metadata" in dropdown
- Added `Pencil` icon + "Edit Metadata" option to the three-dot dropdown menu on `PersonCard`
- Opens `PersonMetadataEditor` dialog (same component used on person detail page)
- Dialog rendered outside `<Link>` to prevent navigation on portal event bubbling

### Person metadata editor tags UI consistency
- Changed tags from inline chips-inside-bordered-container to movie editor style: chip list above + separate `<Input>` component below
- Chips now use `bg-primary/10 text-primary` styling instead of `bg-white/10 text-foreground`
- Remove button uses `<X>` lucide icon instead of plain `×` character
- Imported `X` from lucide-react and `Input` component (already imported) for consistency

## 2026-02-22: Auto-Detect Video-Named NFO Files

### Scanner enhancement
- Before checking for `movie.nfo`, scanner now looks for an NFO file matching the video file name (e.g., `Inception.mp4` → `Inception.nfo`)
- If found, copies it to `movie.nfo` (preserving the original) so existing NFO parse flow works unchanged
- Only triggers when `movie.nfo` does not already exist
- Non-matching NFO names (video name ≠ NFO name) fall through to scraper or skip logic as before
- Enables importing media libraries from other tools (Jellyfin, Kodi, etc.) that use video-named NFO conventions

## 2026-02-22: Multi-Disc/Multi-CD Movie Support

### Database schema
- New `movie_discs` table: per-disc metadata (file_path, label, poster_path, runtime_seconds, video_codec, audio_codec, video_width, video_height, audio_channels, container, total_bitrate, format_name)
- New `movies.disc_count` column (integer, default 1)
- New `media_streams.disc_number` column (integer, default 1)
- New `user_movie_data.current_disc` column (integer, default 1) for multi-disc resume
- All defaults ensure existing single-disc movies work unchanged

### Scanner multi-disc detection
- Regex-based detection: `/[\s._\-\[\(]*(cd|dvd|disc|disk|part|pt)[\s._\-]*(\d+|[a-d])/i`
- Requires 2+ matching video files to be detected as multi-disc (prevents false positives)
- Per-disc poster lookup: `poster-disc{N}`, `poster-cd{N}`, `{videoBaseName}-poster`
- Primary disc probed first, then each additional disc probed and stored in `movie_discs`
- Total runtime calculated as sum of all disc runtimes
- Per-disc media streams stored with `disc_number` column

### API changes
- `GET /api/movies/[id]`: returns `discs[]` array with resolved poster paths and `currentDisc` in userData
- `GET /api/movies/[id]/stream`: supports `?disc=N` query parameter for per-disc streaming
- `PUT /api/movies/[id]/user-data`: accepts `currentDisc` field for resume tracking
- `GET /api/movies/[id]/media-info`: includes per-disc details (file, codec, resolution, runtime)

### Movie detail page disc section
- "Discs (N)" section between hero and cast for multi-disc movies
- Each disc card: poster (150x225, falls back to movie poster), label, runtime, resolution + codec badges
- Entire disc card is a link to play that specific disc
- Hero play button shows "Play All" for multi-disc movies

### Player multi-disc playback
- Reads `?disc=N` URL param or resumes from saved `currentDisc` in userData
- Auto-advances to next disc on `onEnded` event
- Shows disc label in top bar (e.g. "Movie Title — CD 2") with disc counter (2/3)
- Saves `currentDisc` alongside `playbackPositionSeconds` for resume
- On final disc ended: marks movie as played, resets `currentDisc` to 1

### i18n (EN + ZH)
- New `movies` keys: discs (分碟), disc (碟), playAll (播放全部)

## 2026-02-22: Packaging & Distribution System

### Next.js Standalone Adaptation
- Enabled `output: "standalone"` in `next.config.ts` for self-contained server bundle
- Added `sharp` to `serverExternalPackages` for proper native module bundling
- Created `src/lib/paths.ts` — centralized path management with `KUBBY_DATA_DIR` env var support
- Replaced hardcoded `process.cwd()/data` paths in 4 files: `db/index.ts`, `scanner/index.ts`, `person-utils.ts`, `scripts/enrich-nfo.ts`
- Added `FFPROBE_PATH` env var support in `scanner/probe.ts`
- Verified standalone build: `node .next/standalone/.../server.js` starts in ~95ms, all routes functional

### Go Launcher (`launcher/`)
- System tray application using `getlantern/systray`
- Manages Node.js child process lifecycle (start/stop/health check)
- OS-standard data directories: `~/Library/Application Support/Kubby` (macOS), `%LOCALAPPDATA%\Kubby` (Windows), `~/.local/share/kubby` (Linux)
- Auto-generates `AUTH_SECRET` on first run, persisted in data directory
- Config file (`config.json`) for port settings
- Tray menu: Open Kubby, Port display, Quit
- Graceful shutdown: SIGTERM → 5s wait → SIGKILL
- Cross-platform compilation via Makefile (darwin-arm64, darwin-x64, win-x64, linux-x64)
- Binary size: ~9MB

### Packaging Script (`scripts/package.ts`)
- Assembles distributable package: Go launcher + Node.js runtime + ffprobe + Next.js standalone
- Downloads Node.js 22 LTS binary from nodejs.org
- Downloads ffprobe static build (falls back to system ffprobe)
- Selective copy of standalone output (only server.js, package.json, node_modules, .next, public)
- Supports `--platform`, `--skip-download` flags
- Output to `dist/kubby-{platform}/` (~185MB total for darwin-arm64)

### GitHub Actions CI (`.github/workflows/release.yml`)
- Triggered on `v*` tag push
- Matrix builds: macOS arm64/x64, Windows x64, Linux x64
- Creates tar.gz (Unix) / zip (Windows) archives
- Publishes as draft GitHub Release with auto-generated notes

## 2026-02-24: 9 Bug Fixes & UI Improvements

### Windows folder picker: show all drives
- Filesystem API (`/api/filesystem`) now enumerates Windows drive letters via `wmic logicaldisk` (fallback: probe A-Z)
- When no path is specified on Windows, returns drive list (`isDriveList: true`) instead of defaulting to C:\Users\...
- At drive root (e.g. `C:\`), parent navigates back to drive list
- Folder picker UI shows HardDrive icon when viewing drives, disables "Select This Folder" on drive list

### Setup wizard: multi-folder + Jellyfin compatibility mode
- Setup wizard step 3 upgraded from single folder input to multi-folder support (same UI pattern as dashboard library creation)
- Each added path shown with X remove button, text input with Enter key support + folder picker + Add button
- Added Jellyfin Compatibility Mode toggle with description
- Auto-includes pending text input path on submit (prevents paste-and-submit empty path bug)
- Setup/complete API updated to accept `folderPaths[]` array and `jellyfinCompat` boolean (backward compatible with single `folderPath`)
- i18n: Added `jellyfinCompatMode` and `jellyfinCompatDesc` keys (EN + ZH)

### Scan progress after setup
- Homepage auto-detects libraries with `lastScannedAt=null` and `movieCount=0`, triggers SSE scan automatically
- Scan progress shown in global scan bar (bottom of page) via existing ScanProvider infrastructure
- Removed fire-and-forget `scanLibrary()` call from setup/complete API to avoid double-scanning

### Windows external player (PotPlayer) fix
- `launchMac()` now checks `playerName` before appending IINA-specific `/Contents/MacOS/iina-cli` path — generic players use `open -a` instead
- `launchWindows()` now handles PotPlayer, VLC (with `--start-time`), and generic players separately
- Root cause: any player name on macOS was treated as IINA, causing `/Contents/MacOS/iina-cli` to be appended to non-IINA paths

### Jellyfin poster/fanart naming conventions
- Scanner now searches for `{videoBaseName}-poster.*` and `{folderName}-poster.*` after standard patterns (poster.*, folder.*, cover.*)
- Scanner now searches for `{videoBaseName}-fanart.*` and `{folderName}-fanart.*` after standard patterns (fanart.*, landscape.*, backdrop.*)
- Disc poster detection also supports `{baseName}-cd{N}-poster.*` pattern

### Controller already closed error fix
- Stream API (`/api/movies/[id]/stream`) now wraps ReadableStream controller calls in try/catch with a `closed` flag
- Added `cancel()` callback to destroy the underlying fs.ReadStream when client disconnects
- Prevents `TypeError: Invalid state: Controller is already closed` when browser seeks mid-stream

### Library creation with pasted folder path
- Dashboard "Add Library" dialog now auto-includes any text in the pending folder path input when submitting
- Same fix applied to setup wizard — no more empty `folderPaths` when user pastes a path and clicks submit without pressing Enter

### Cast cards enlarged
- Movie detail page cast section: PersonCard size changed from "sm" (140x210) to "movie" (180x270) to match movie card dimensions

### Person gallery images enlarged
- Gallery target row height increased from 280px to 360px for better viewing

### Windows uninstall data cleanup option
- NSIS uninstaller now shows a Yes/No MessageBox asking whether to delete `%LOCALAPPDATA%\Kubby` user data
- Default is "No" (preserve data for future installations)
- Only deletes data directory if user explicitly confirms

## 2026-02-24: Dashboard Libraries Redesign & Scraper Icon Fix

### Media Libraries dashboard page redesigned (Jellyfin-style)
- Library cards now display cover images (fanart from random movie) in a responsive grid (2–5 columns)
- Each card shows library name overlaid on cover image with dark backdrop
- "Scan All Libraries" button added to header alongside "Add Library"
- Three-dot (⋮) dropdown menu on each card with: Scan Library, Edit, Delete
- Clicking cover image opens Edit Library dialog with full settings (name, folder paths, scraper, metadata language, Jellyfin compat)
- Delete confirmation via proper Dialog instead of native `confirm()`
- Scan progress overlay with progress bar shown directly on the card during scanning

### Scraper sidebar icon changed
- Replaced `Search` icon with `Wand2` (magic wand) icon in the admin sidebar for the Scraper Settings link
- Eliminates confusion with the search functionality icon

## 2026-02-25: Movie Bookmarks with Canvas Screenshot Capture

### Database & backend
- New `movie_bookmarks` table: id, userId, movieId, timestampSeconds, discNumber, iconType, tags (JSON), note, thumbnailPath, createdAt
- Indexes on (userId, movieId) and (movieId) for efficient querying
- `getBookmarksDir()` in paths.ts for bookmark thumbnail storage
- Inline migration (0015) with CREATE TABLE + 2 indexes

### API routes
- `GET /api/movies/[id]/bookmarks`: List user's bookmarks for a movie, ordered by timestamp asc, tags parsed from JSON
- `POST /api/movies/[id]/bookmarks`: Create bookmark via FormData (supports thumbnail file upload), saves JPG to `data/bookmarks/{userId}/{movieId}/{bookmarkId}.jpg`
- `PUT /api/movies/[id]/bookmarks/[bookmarkId]`: Update bookmark (iconType, tags, note)
- `DELETE /api/movies/[id]/bookmarks/[bookmarkId]`: Delete bookmark + cleanup thumbnail file

### Player UI
- Two bookmark buttons in right controls: Quick bookmark (Bookmark icon, blue) and Detailed bookmark (BookmarkPlus icon, yellow)
- Quick bookmark (B key): captures canvas screenshot, uploads with default settings, shows OSD "Bookmark added"
- Detailed bookmark (Shift+B): pauses video, opens overlay panel with type selector (bookmark/star), tag input (Enter to add, X to remove), note textarea
- Canvas screenshot: 320×180 JPEG at 85% quality via `<canvas>.drawImage()` + `toBlob()`
- Progress bar markers: colored dots (blue for bookmark, gold for star) at bookmark timestamps, with tooltip and click-to-seek
- `?t=SECONDS` URL parameter support for bookmark navigation (takes priority over saved position)
- Keyboard shortcuts added to help overlay

### Movie detail page
- Bookmarks section between Discs and Cast using ScrollRow with count display
- BookmarkCard component: 320×180 thumbnail card with icon, timestamp, tags, note, delete-on-hover
- Click navigates to player at bookmark timestamp (internal) or launches external player with start time
- Delete bookmark via hover trash button

### External player
- `launchExternal()` now accepts optional `startSeconds` parameter
- Stream mode: IINA gets `&start=` param, PotPlayer gets `/seek=` param in protocol URLs
- Local mode: `startSeconds` passed in POST body to play-external API
- `play-external` API: accepts `overrideStartSeconds` from body, falls back to saved position

### BookmarkCard component
- 320×180 card with thumbnail (or Clock icon fallback), bottom gradient with icon + timestamp
- Tag pills (max 3) top-right, disc badge top-left for multi-disc movies
- Delete button appears on hover (red circle with Trash2 icon)
- Renders as Link (internal player) or button (external player) based on mode

### i18n (EN + ZH)
- 14 new keys in `movies` namespace: bookmarks, addBookmark, quickBookmark, detailedBookmark, bookmarkAdded, bookmarkSaved, deleteBookmark, bookmarkType, bookmarkTags, bookmarkNote, bookmarkNotePlaceholder, saveBookmark, tagsPlaceholder

## 2026-02-25: Custom Bookmark Icons (9 Built-in + User-Uploaded)

### Built-in icons library (`src/lib/bookmark-icons.ts`)
- 9 built-in lucide icons with color theming: Bookmark (blue), Star (yellow), Zap/Action (orange), Music (violet), MessageSquare/Dialogue (emerald), Laugh/Funny (amber), Heart/Emotion (red), Eye/Visual (sky), Swords/Suspense (purple)
- `BUILTIN_BOOKMARK_ICONS` array with id, label, icon component, color classes, and hex color for inline styles
- `getBuiltinIcon(id)` helper for lookup

### Database & backend
- New `bookmark_icons` table: id, userId, label, imagePath, createdAt with user index
- DB migration 0016 (CREATE TABLE + index)
- `getBookmarkIconsDir()` in paths.ts for custom icon storage

### Custom icon API routes
- `GET /api/settings/bookmark-icons`: List user's custom icons
- `POST /api/settings/bookmark-icons`: Upload icon (FormData: label + file), validates PNG/WebP, ≤256KB, max 20 per user, sharp resize to 64×64 PNG on transparent bg
- `PUT /api/settings/bookmark-icons/[iconId]`: Update label
- `DELETE /api/settings/bookmark-icons/[iconId]`: Remove file + DB row, reset bookmarks using this icon to "bookmark" default

### Personal Metadata page — Bookmark Icons section
- New frosted-glass card with built-in icons display (read-only grid) and custom icons management
- Custom icons grid with hover X delete button, upload row with file input + label input + Upload button
- Format hint and max count display

### Player page icon selector
- Replaced 2-button bookmark/star selector with scrollable icon grid showing all 9 built-in icons + custom icons
- Each icon renders with its lucide component and color theme
- Custom icons render as `<img>` from `/api/images/{path}`
- Selected state: ring highlight with the icon's color

### BookmarkCard dynamic icon rendering
- Imports `BUILTIN_BOOKMARK_ICONS` and `getBuiltinIcon` for icon lookup
- New `customIcons` prop for custom icon data
- Bottom gradient bar: built-in icons render as colored lucide components, custom icons render as 16×16 `<img>`
- Edit dialog: same scrollable icon grid as player panel
- Progress bar markers: use `getBuiltinIcon(id)?.hexColor ?? "#ffffff"` for inline backgroundColor

### Movie detail page wiring
- Fetches custom icons via `useQuery` from `/api/settings/bookmark-icons`
- Passes `customIcons` prop to each `<BookmarkCard>`

### i18n (EN + ZH)
- 12 new keys in `personalMetadata` namespace: bookmarkIcons, bookmarkIconsDesc, builtinIcons, customIcons, uploadIcon, iconLabel, iconLabelPlaceholder, iconFormatHint, maxCustomIcons, iconUploaded, iconDeleted

## 2026-02-25: Auto-Scrape Actor Biography from TMDB Person API

### TMDB Person Details API (`src/lib/tmdb.ts`)
- New `TmdbPersonDetails` interface: birthday, deathday, biography, place_of_birth, imdb_id
- New `fetchPersonDetails(tmdbPersonId, apiKey, language)` function calling `GET /person/{id}`
- Reuses existing `fetchWithRetry()` for 429 rate-limit handling

### Scraper integration (`src/lib/scraper/index.ts`)
- During movie scraping, calls `fetchPersonDetails()` for each of the top 20 cast members
- Returns `actorBios[]` in `ScrapeResult` alongside the movie data
- 250ms rate limiting between person API calls
- Non-critical: failures skip person details silently

### Scanner person creation (`src/lib/scanner/index.ts`)
- `getOrCreatePerson()` now accepts optional `PersonBioData` parameter: tmdbId, overview, birthDate, placeOfBirth, deathDate, imdbId
- New records: all bio fields written on creation
- Existing records: missing bio fields backfilled (same pattern as photo path updates)
- `birthYear` auto-derived from `birthDate`
- TMDB supplement path (NFO has tmdbId but no actors) also fetches person details

### NFO tmdbid support
- NFO writer: `<tmdbid>` tag added inside `<actor>` blocks (both `writeFullNfo` and `writeActorsToNfo`)
- NFO parser: parses `<tmdbid>` from actor elements, stored as `actor.tmdbId`
- When NFO has tmdbId but no scraped bio data, tmdbId still passed to `getOrCreatePerson()`

### Data flow
- Scraper path: scrapeMovie() → fetchPersonDetails() → actorBios → scanLibrary() → getOrCreatePerson(bio)
- Supplement path: fetchMovieCredits() → fetchPersonDetails() → supplementBios → getOrCreatePerson(bio)
- NFO-only path: parseNfo() → actor.tmdbId → getOrCreatePerson({ tmdbId })

## 2026-02-26: README Overhaul — Bilingual, Feature Showcase, Humanized, GPL-2.0

### Bilingual README with language switcher
- `README.md` (English) and `README.zh-CN.md` (Chinese) with cross-links at the top
- Both files share identical structure and screenshot placeholders

### Feature showcase restructure
- New "Basics" section: Jellyfin-style UI, Kodi/Jellyfin library compatibility, TMDB scraper
- New "What Kubby adds" section with 7 enhanced features (each with scenario description + screenshot placeholder):
  1. Multi-dimension ratings with per-dimension sorting
  2. Poster and actor card badges (rating/resolution/tier)
  3. Actor photo gallery (justified row + lightbox)
  4. Filmography sorted by actor age at release
  5. External player integration (IINA/PotPlayer, local/stream toggle)
  6. Video bookmarks with custom icons
  7. Category-based search (movies/actors/bookmarks)
- Created `docs/screenshots/` directory for future screenshot assets
- GitHub GIF support confirmed for animated demos

### Humanizer pass (AI writing pattern removal)
- Applied humanizer skill to both English and Chinese versions
- Sentence-case headings throughout (pattern #16)
- Removed "Kubby" subject repetition in bullet lists
- Chinese version uses conversational tone: "跑一下"、"排个序"、"关掉就好" instead of formal phrasing
- No promotional language, no vague attributions

### License change
- Changed from MIT to GPL-2.0
- Created `LICENSE` file with GPL-2.0 full text
- Updated license in both README.md and README.zh-CN.md

## 2026-02-26: Search Genre/Tag Badge Fix & Backdrop Quality Improvement

### Search genre/tag preview badges
- Genre and tag preview movies in search results now show rating and resolution badges (previously missing)
- Search API: genre/tag preview queries now JOIN `user_movie_data` for `personal_rating` and SELECT `community_rating`, `video_width`, `video_height`
- Frontend: `GenreResult.previewMovies` type extended, `MovieCard` receives `rating`, `personalRating`, `videoWidth`, `videoHeight` props
- Badges now respect user badge settings consistently across all views

### TMDB backdrop resolution upgrade
- Changed `TMDB_BACKDROP_SIZE` from `w1280` (1280×720) to `original` (typically 1920×1080+)
- Matches Jellyfin's approach of downloading full-resolution backdrop images from TMDB

### Library cover card size increase
- Library cover cards enlarged from 320×180 to 360×200 (16:9 ratio preserved)

## 2026-02-27: Dimension Label Display Width Increase

### Wider dimension label truncation limits
- StarRatingDialog (movie + person): `w-[5rem]` → `w-[8rem]` (80px → 128px) — longer dimension names now visible in the popup rating dialog
- MovieMetadataEditor "Personal" tab: `max-w-[12rem]` → `max-w-[16rem]` (192px → 256px)
- PersonMetadataEditor "Personal" tab: `max-w-[12rem]` → `max-w-[16rem]` (192px → 256px)
- Full text still available via hover tooltip on all truncated labels

## 2026-02-27: Search Title Truncation & Player Controls Centering

### Search suggestion titles truncated to one line
- Movie title links in search suggestions limited to `max-w-[280px]` with `truncate`
- Prevents long titles from wrapping to two lines, shows `...` overflow
- Full title available via hover tooltip

### Player play/skip buttons absolutely centered
- Changed from `justify-between` flex layout to absolute centering (`left-1/2 -translate-x-1/2`)
- Play/pause, skip back, skip forward buttons now visually centered in the control bar regardless of left (time display) and right (bookmarks/volume/etc) group widths

## 2026-02-28: Library Scan Improvements & Bug Fixes

### Remove auto-scan, add unscanned state
- Removed auto-scan `useEffect` from homepage — libraries no longer auto-scan after setup wizard
- Library cards show "unscanned" overlay with "Scan Now" button when `lastScannedAt` is null
- User-initiated scanning instead of automatic, eliminating perceived setup page slowness

### Skipped folder tracking in scanner
- Scanner now tracks 3 skip reasons: `no_nfo`, `no_video`, `nfo_parse_error`
- `scanLibrary()` returns `{ scannedCount, removedCount, skipped }` with full skip details
- SSE progress events now include movie `title` for real-time display
- Done event includes `skippedCount` and `skipped[]` array

### Scan progress UI improvements
- Global scan bar shows current movie title during scan: "Scanning: Inception (42/100)"
- On completion with skips: "Scanned 42 movies, 5 skipped" with expandable skip list
- Each skipped folder shows reason (no NFO, no video, parse error)
- Library card shows skip count in scan result
- Long movie titles truncated with ellipsis (`max-w-[80vw]` in global bar, `max-w-full` on card)

### Scan provider state updates
- `ScanState` extended with `title` in progress and `skipped[]` array
- Result format changed from `done:count` to `done:scanned:skipped`
- `useLibraryScan` hook exposes `skipped` array

### Setup wizard library creation fix
- Fixed: if user filled folder paths but left library name empty, library was silently not created
- Now validates library name is required when paths are provided, shows error message
- Added `libraryNameRequired` i18n key (EN + ZH)

### Image path traversal check fix
- Fixed: `normalizedPath.includes("..")` substring check rejected legitimate folder names containing consecutive dots (e.g. `A...B`)
- Changed to per-segment check: `segments.some(s => s === "..")` — only rejects actual `..` traversal segments
- Folder names like `Movie... Something` or `What If..?` now serve images correctly

### PotPlayer external player fixes
- Fixed argument order: PotPlayer expects `/seek=SECONDS filepath` (seek before file path)
- Fixed seek unit: PotPlayer `/seek` takes seconds, not milliseconds (removed `* 1000`)
- Fixed in local mode (`execFile`), stream mode protocol URLs (movie detail + search page)
- Added debug logging: full command logged to server console and returned in API response `cmd` field
- Frontend logs command to browser console for easy copy-paste debugging

### i18n (EN + ZH)
- New `home` keys: scanProgressWithTitle, scanCompleteWithSkipped, unscanned, clickToScan, skippedFolders, skipReasonNoNfo, skipReasonNoVideo, skipReasonNfoParseFailed
- New `setup` key: libraryNameRequired
