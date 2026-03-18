# Kubby Mobile Adaptation Plan

## Overview

Kubby 当前为纯桌面设计，所有页面使用固定像素宽度和大内边距，无任何响应式断点。本文档规划各页面的手机端适配方案。

**设计原则**：
- 桌面端代码零改动，所有移动端样式写在无前缀端，桌面样式加 `md:` 前缀
- 统一断点：`768px`（Tailwind `md`），手机 < 768px，桌面 >= 768px
- CSS 响应式为主（Tailwind 断点），`useIsMobile` hook 为辅（仅在需要 JS 逻辑分支时使用）
- 手机端优先触控体验，按钮更大、间距更紧凑、滑动友好

**需新增的基础设施**：
- `src/hooks/use-mobile.ts` — `useIsMobile()` hook，基于 `matchMedia`，与 Tailwind `md:` 断点同步

---

## Phase 1: 核心可用（让手机能正常浏览）

### 1.1 全局 Layout & Header

**当前问题**：
- `app-header.tsx`：`px-8` 内边距在小屏上占比过大
- Header 高度 `h-12` 适合手机，可保留

**适配方案**：
```
Header:  px-3 md:px-8（缩小手机端内边距）
```

**涉及文件**：`src/components/layout/app-header.tsx`

---

### 1.2 Login / Register 页面

**当前问题**：
- 表单容器固定 `w-[480px]`，手机上直接溢出

**适配方案**：
```
桌面端（不变）：          手机端：
┌─────────────┐         ┌──────────┐
│  ┌───480px──┐│         │ ┌─全宽──┐ │
│  │  Kubby   ││         │ │ Kubby │ │
│  │ [Login]  ││         │ │[Login]│ │
│  └──────────┘│         │ └───────┘ │
└─────────────┘         └──────────┘
```

**改动**：
- `w-[480px]` → `w-full max-w-[480px] mx-4 md:mx-0`
- 内边距 `px-10 py-12` → `px-6 py-8 md:px-10 md:py-12`

**涉及文件**：`src/app/(auth)/login/login-form.tsx`, register 对应文件

---

### 1.3 Home 页面

**当前问题**：
- 内容区 `px-12 py-8` 在手机上太宽
- Favorites 网格 `gridTemplateColumns: repeat(auto-fill, 180px)` 在小屏上一行只能放 2 张

**适配方案**：
```
桌面端（不变）：           手机端：
px-12 py-8              px-4 py-4
ScrollRow 横向滚动        ScrollRow 横向滚动（触控滑动）
Favorites 网格 180px     Favorites 网格 minmax(140px, 1fr)
```

**改动**：
- `px-12 py-8` → `px-4 py-4 md:px-12 md:py-8`
- `gap-10` → `gap-6 md:gap-10`
- Favorites 网格：inline style 改为 Tailwind `grid grid-cols-2 md:grid-cols-[repeat(auto-fill,180px)]` 或保持 auto-fill 但最小值改为 `minmax(140px, 1fr)`

**涉及文件**：`src/app/(main)/page.tsx`

---

### 1.4 Movies Browse 页面

**当前问题**：
- 内容区 `px-12`，电影网格用 `repeat(auto-fill, 180px)` inline style
- 排序/筛选下拉按钮在小屏可能挤在一起

**适配方案**：
```
桌面端（不变）：           手机端：
px-12                   px-4
电影网格 180px cards      电影网格 2 列自适应
排序+筛选横排             排序+筛选横排（更紧凑）
Tabs 标签栏               Tabs 标签栏（可横滑）
```

**改动**：
- `px-12` → `px-4 md:px-12`
- 电影网格：`grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)] md:gap-4`
- MovieCard 在网格模式下宽度改为自适应：手机上 `w-full`，桌面上 `w-[180px]`

**涉及文件**：`src/app/(main)/movies/page.tsx`

---

### 1.5 Movie Detail 页面 (核心改动)

**当前问题**：
- Hero 区域 `min-h-[750px]` + fanart 全屏背景 + poster(350x525) 叠加在左侧
- 内容区 `px-20 pb-24`，按钮行横排
- 各 section `px-20`

**适配方案**：
```
桌面端（不变）：              手机端：
┌──────────────────┐       ┌──────────┐
│   fanart bg      │       │ fanart   │ ← 16:9 独占一行 h-[220px]
│ ┌──────┐ info    │       │ (banner) │
│ │poster│ title   │       ├──────────┤
│ │      │ rating  │       │ title    │ ← 直接显示标题
│ │      │ > play  │       │ meta     │ ← year / rating / badges
│ └──────┘         │       │ > PLAY   │ ← 全宽 play 按钮
└──────────────────┘       │ [action] │ ← 操作按钮行
                           │ overview │
                           │ metadata │
                           └──────────┘
```

**改动**：

Hero 区域：
- `min-h-[750px]` → `min-h-0 md:min-h-[750px]`
- Fanart：手机上改为 `relative h-[220px]`，桌面上保持 `absolute inset-0`
  - 手机上：`relative h-[220px] w-full md:absolute md:inset-0 md:h-auto`
- Poster：手机上隐藏 `hidden md:block`
- 渐变遮罩：手机上不需要左右渐变，仅底部渐变
- Content row：
  - `px-20 pb-24` → `px-4 pb-6 md:px-20 md:pb-24`
  - 手机上改为非 absolute 定位的普通流布局
  - `absolute inset-x-0 bottom-0` → 手机上 `relative`，桌面上保持 `md:absolute md:inset-x-0 md:bottom-0`

标题 & 信息区：
- `text-4xl` → `text-2xl md:text-4xl`
- Overview `max-w-[80%]` → `max-w-full md:max-w-[80%]`

Action buttons：
- Play 按钮：手机上全宽 `w-full md:w-auto`
- 图标按钮行：保持横排，手机上更紧凑

各 Section：
- `px-20` → `px-4 md:px-20`
- `mt-4` 保持不变

**涉及文件**：`src/app/(main)/movies/[id]/page.tsx`

---

### 1.6 Person Detail 页面

**当前问题**：
- 与 Movie Detail 相同的 hero 布局（fanart + poster 叠加）
- `px-20` 内边距

**适配方案**：
与 Movie Detail 完全同构，手机端同样改为：
- Fanart 独占一行（banner 模式）
- 隐藏 poster 照片（`hidden md:block`）
- 内边距 `px-4 md:px-20`
- Filmography section 保持 ScrollRow 横滑

**涉及文件**：`src/app/(main)/people/[id]/page.tsx`

---

### 1.7 Search 页面

**当前问题**：
- 搜索框 `w-[800px]` 固定宽度
- 内容区 `px-12 pt-12`
- Category chips 横排

**适配方案**：
```
桌面端（不变）：           手机端：
w-[800px] 搜索框        w-full 全宽搜索框
px-12 pt-12             px-4 pt-4
Category chips 横排      chips 可横滑
```

**改动**：
- 搜索框：`w-[800px]` → `w-full max-w-[800px]`
- `px-12 pt-12` → `px-4 pt-6 md:px-12 md:pt-12`
- `pt-10`（搜索框上方间距）→ `pt-4 md:pt-10`
- Category chips 容器：添加 `flex-wrap` 或 `overflow-x-auto` 让手机上可换行/横滑

**涉及文件**：`src/app/(main)/search/page.tsx`

---

### 1.8 Settings 页面

**当前问题**：
- 设置卡片固定 `w-[720px]` 居中

**适配方案**：
- `w-[720px]` → `w-full max-w-[720px] px-4 md:px-0`

**涉及文件**：`src/app/(main)/settings/page.tsx`

---

### 1.9 Dashboard (Admin) 页面

**当前问题**：
- AdminSidebar `w-60` 永久显示，小屏上挤占内容区

**适配方案**：
- 手机上隐藏永久侧栏，改为顶部水平 Tab 或汉堡菜单触发的抽屉
- Dashboard layout：`flex h-full` → 手机上 `flex-col`
- AdminSidebar：`hidden md:flex md:w-60` + 手机上添加顶部横向导航条

**涉及文件**：
- `src/app/(main)/dashboard/layout.tsx`
- `src/components/layout/admin-sidebar.tsx`

---

## Phase 2: 体验优化

### 2.1 底部 Tab 栏（手机专属）

**方案**：在 Main Layout 中添加底部 Tab 栏，仅手机端显示（`md:hidden`）。

```
┌──────────────────┐
│   page content   │
│                  │
├──────────────────┤
│ Home Movies Search Settings │  ← 底部 Tab 栏
└──────────────────┘
```

**Tab 项**：
- Home（首页）
- Movies（电影浏览）
- Search（搜索）
- Settings（设置）

**改动**：
- 新建 `src/components/layout/bottom-tabs.tsx`
- Main Layout 中添加：`<BottomTabs className="md:hidden" />`
- `<main>` 需要 `pb-14 md:pb-0` 预留底部空间
- 播放页面隐藏底部 Tab（与 Header 处理方式一致）

**涉及文件**：
- 新建 `src/components/layout/bottom-tabs.tsx`
- `src/app/(main)/layout.tsx`

---

### 2.2 MovieCard 尺寸自适应

**当前问题**：
- MovieCard 固定 `style={{ width: 180 }}` inline style
- 手机上一行只能放 2 张（考虑间距）

**适配方案**：
- ScrollRow 中：保持固定 `180px`（横滑模式下固定宽度体验更好）
- Grid 网格中（Favorites、Movies Browse）：手机上改为 `w-full`，由网格列控制宽度
  - 需要给 MovieCard 添加 `className` prop 或用父容器控制
  - poster 高度改为 `aspect-ratio: 2/3` 代替固定 `270px`

**涉及文件**：`src/components/movie/movie-card.tsx`

---

### 2.3 ScrollRow 触控优化

**当前问题**：
- 左右 Chevron 按钮在触控设备上不自然
- 已有 `scrollbar-hide` 和 `overflow-x-auto`，触控滑动本身可用

**适配方案**：
- Chevron 按钮：`hidden md:flex`（手机上隐藏，依赖触控滑动）
- 添加 `scroll-snap-type: x mandatory` + 子项 `scroll-snap-align: start` 提升触控滑动体感

**涉及文件**：`src/components/ui/scroll-row.tsx`

---

### 2.4 Dialog 全屏适配

**当前问题**：
- 各 Dialog 使用 `sm:max-w-[Xpx]`，shadcn 默认 < sm 时已接近全宽
- 但复杂 dialog（metadata editor、image editor）在小屏上可能内容溢出

**适配方案**：
- 复杂 dialog：手机上改为全屏模式 `h-[100dvh] max-h-[100dvh] rounded-none md:h-auto md:max-h-[85vh] md:rounded-lg`
- 简单 dialog（确认/删除）：保持现有行为即可

**涉及文件**：
- `src/components/movie/movie-metadata-editor.tsx`
- `src/components/shared/image-editor-dialog.tsx`
- `src/components/movie/star-rating-dialog.tsx`

---

### 2.5 Bookmark Card 自适应

**当前问题**：
- BookmarkCard 固定 `320px` 宽度

**适配方案**：
- ScrollRow 中保持 `320px`（横滑模式）
- 如有网格模式：`w-full max-w-[320px] md:w-[320px]`

**涉及文件**：`src/components/movie/bookmark-card.tsx`

---

## Phase 3: 精细打磨

### 3.1 播放器页面

**当前问题**：需要检查视频播放器在手机上的表现（全屏、控制栏等）。

**适配方案**：
- 手机上默认横屏提示或自动全屏
- 控制栏按钮增大触控区域
- 进度条拖动适配触控事件

**涉及文件**：`src/app/(main)/movies/[id]/play/page.tsx`

---

### 3.2 Frame Scrubber 触控适配

**当前问题**：书签帧浏览器依赖鼠标拖动。

**适配方案**：
- 添加 touch 事件支持
- 手机上缩小帧预览区域

**涉及文件**：`src/components/movie/frame-scrubber.tsx`

---

### 3.3 Library Card 自适应

**当前问题**：
- LibraryCard 固定 `360px` 宽度

**适配方案**：
- 手机上改为全宽卡片 `w-[calc(100vw-32px)] md:w-[360px]`
- 或在 ScrollRow 中保持固定宽度（横滑）

**涉及文件**：`src/components/library/library-card.tsx`

---

### 3.4 Personal Metadata / Card Badges 页面

**当前问题**：
- 内容卡片固定 `w-[720px]`

**适配方案**：
- 与 Settings 页面相同：`w-full max-w-[720px] px-4 md:px-0`

**涉及文件**：
- `src/app/(main)/personal-metadata/page.tsx`
- `src/app/(main)/card-badges/page.tsx`

---

## Implementation Checklist

### Phase 1 (核心可用)
- [ ] 新建 `src/hooks/use-mobile.ts`
- [ ] Login / Register 表单自适应
- [ ] AppHeader 内边距调整
- [ ] Home 页面内边距 + 网格自适应
- [ ] Movies Browse 页面内边距 + 网格自适应
- [ ] Movie Detail 页面完整重构（hero fanart/poster 布局）
- [ ] Person Detail 页面同构调整
- [ ] Search 页面搜索框 + 内边距
- [ ] Settings 页面表单宽度
- [ ] Dashboard 侧栏移动端处理

### Phase 2 (体验优化)
- [ ] 底部 Tab 栏组件
- [ ] MovieCard 尺寸自适应（grid vs scroll 两种模式）
- [ ] ScrollRow 触控优化（隐藏箭头 + scroll-snap）
- [ ] Dialog 全屏适配
- [ ] BookmarkCard 自适应

### Phase 3 (精细打磨)
- [ ] 播放器触控适配
- [ ] Frame Scrubber 触控适配
- [ ] LibraryCard 自适应
- [ ] Personal Metadata / Card Badges 自适应

---

## Quick Reference: 全局内边距映射

| 当前值 | 改为 | 位置 |
|--------|------|------|
| `px-20` | `px-4 md:px-20` | Movie Detail, Person Detail 各 section |
| `px-12` | `px-4 md:px-12` | Home, Movies Browse, Search |
| `px-8` | `px-3 md:px-8` | AppHeader |
| `w-[480px]` | `w-full max-w-[480px]` | Login/Register form |
| `w-[720px]` | `w-full max-w-[720px]` | Settings, Personal Metadata, Card Badges |
| `w-[800px]` | `w-full max-w-[800px]` | Search input |
