# Kubby Architecture Reference

> 本地自托管影音管理系统，参考 Jellyfin 架构简化实现。当前版本仅支持电影媒体库。

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) + TypeScript | 16.1.6 |
| UI | shadcn/ui + Tailwind CSS v4 | shadcn 3.8.4 |
| 数据库 | SQLite (better-sqlite3, WAL 模式) | 12.6.2 |
| ORM | Drizzle ORM | 0.45.1 |
| 认证 | NextAuth.js v5 (Auth.js) + Credentials + JWT | 5.0.0-beta.30 |
| 数据获取 | TanStack React Query | 5.90.20 |
| NFO 解析 | fast-xml-parser | 5.3.5 |
| 国际化 | next-intl | 4.8.2 |
| 图标 | lucide-react | 0.563.0 |
| 运行时 | Node.js | 22.12.0 |

---

## 项目目录结构

```
kubby/
├── src/
│   ├── app/
│   │   ├── layout.tsx                              # 根布局 (async, Inter 字体, NextIntlClientProvider, 动态 lang)
│   │   ├── globals.css                             # Tailwind v4 + 深色影院主题变量 + CJK 字体回退
│   │   ├── (auth)/                                 # 认证路由组 (无 header)
│   │   │   ├── layout.tsx                          # 空壳布局
│   │   │   ├── login/
│   │   │   │   ├── page.tsx                        # 登录页入口 (Server Component, 首次运行重定向到 /setup)
│   │   │   │   └── login-form.tsx                  # 登录表单 (Client Component, i18n, 登录后恢复 locale)
│   │   │   └── register/page.tsx                   # 注册页 (i18n)
│   │   ├── (setup)/                                # 首次设置路由组 (无 header, 公开)
│   │   │   ├── layout.tsx                          # 空壳布局
│   │   │   └── setup/
│   │   │       ├── page.tsx                        # 设置入口 (Server Component, 有用户则重定向)
│   │   │       └── setup-wizard.tsx                # 4 步欢迎向导 (Client Component)
│   │   ├── (main)/                                 # 主应用路由组 (有 header)
│   │   │   ├── layout.tsx                          # SessionProvider + QueryProvider + AppHeader
│   │   │   ├── page.tsx                            # 首页 (媒体库/继续观看/最近添加/收藏)
│   │   │   ├── movies/
│   │   │   │   ├── page.tsx                        # 电影浏览 (网格+过滤+排序)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx                    # 电影详情 (fanart+poster+元数据+演员+推荐)
│   │   │   │       └── play/page.tsx               # 视频播放器 (全屏, 进度保存)
│   │   │   ├── people/[id]/page.tsx                # 演员详情 (fanart+大卡片+参演作品)
│   │   │   ├── search/page.tsx                     # 搜索结果 (电影+演员)
│   │   │   ├── settings/page.tsx                   # 用户设置 (个人资料/密码/语言切换/账户信息, i18n)
│   │   │   └── dashboard/                          # 管理后台 (需 admin 权限)
│   │   │       ├── layout.tsx                      # AdminSidebar 布局
│   │   │       ├── page.tsx                        # 管理概览 (统计+活动+快速操作)
│   │   │       ├── libraries/page.tsx              # 媒体库管理 (CRUD+扫描+文件夹选择器)
│   │   │       └── users/page.tsx                  # 用户管理
│   │   └── api/                                    # API Routes (共 17 个端点)
│   │       ├── auth/[...nextauth]/route.ts         # NextAuth 端点
│   │       ├── dashboard/
│   │       │   ├── stats/route.ts                  # GET 管理统计
│   │       │   └── activity/route.ts               # GET 最近活动 (占位)
│   │       ├── filesystem/route.ts                 # GET 服务端目录浏览
│   │       ├── images/[...path]/route.ts           # GET 本地图片服务
│   │       ├── libraries/
│   │       │   ├── route.ts                        # GET 列表 / POST 创建
│   │       │   └── [id]/
│   │       │       ├── route.ts                    # GET 详情 / DELETE 删除
│   │       │       └── scan/route.ts               # POST 触发扫描
│   │       ├── movies/
│   │       │   ├── route.ts                        # GET 列表 (搜索/过滤/排序/分页)
│   │       │   └── [id]/
│   │       │       ├── route.ts                    # GET 详情 (含演员/导演/userData)
│   │       │       ├── stream/route.ts             # GET 视频流 (HTTP 206 Range)
│   │       │       └── user-data/route.ts          # GET/PUT 播放进度/收藏/已看
│   │       ├── people/[id]/route.ts                # GET 演员详情+参演作品
│   │       ├── setup/
│   │       │   ├── status/route.ts                 # GET 是否需要首次设置
│   │       │   └── complete/route.ts               # POST 完成首次设置 (创建 admin + 可选媒体库)
│   │       └── users/
│   │           ├── route.ts                        # GET 列表 / POST 注册
│   │           └── me/
│   │               ├── route.ts                    # GET 当前用户资料 / PUT 更新 (displayName, locale)
│   │               └── password/route.ts           # PUT 修改密码
│   ├── components/
│   │   ├── layout/
│   │   │   ├── app-header.tsx                      # 顶部导航栏 (logo+导航+搜索+头像)
│   │   │   └── admin-sidebar.tsx                   # 管理侧边栏 (概览/媒体库/用户)
│   │   ├── movie/
│   │   │   └── movie-card.tsx                      # 电影海报卡片 (2:3, 180x270)
│   │   ├── people/
│   │   │   └── person-card.tsx                     # 演员卡片 (sm/md/lg 三种尺寸)
│   │   ├── library/
│   │   │   ├── library-card.tsx                    # 媒体库卡片 (16:9, 320x180)
│   │   │   └── folder-picker.tsx                   # 服务端文件夹选择器弹窗
│   │   └── ui/                                     # shadcn/ui 组件 (13个)
│   │       ├── avatar.tsx, badge.tsx, button.tsx, card.tsx
│   │       ├── dialog.tsx, dropdown-menu.tsx, input.tsx, label.tsx
│   │       ├── progress.tsx, scroll-area.tsx, separator.tsx
│   │       ├── slider.tsx, tabs.tsx
│   ├── i18n/
│   │   ├── config.ts                               # 语言配置 (locales: en/zh, defaultLocale: en)
│   │   ├── request.ts                              # next-intl 服务端配置 (从 cookie NEXT_LOCALE 读取)
│   │   ├── locale.ts                               # Server Action: setLocale() 写 cookie
│   │   └── messages/
│   │       ├── en.json                             # 英文翻译 (10 个命名空间)
│   │       └── zh.json                             # 中文翻译 (同结构)
│   ├── lib/
│   │   ├── auth.ts                                 # NextAuth 完整配置 (含 DB 查询, locale)
│   │   ├── auth.config.ts                          # NextAuth 轻量配置 (供 middleware 使用, 无 DB)
│   │   ├── db/
│   │   │   ├── schema.ts                           # Drizzle schema (6 张表)
│   │   │   └── index.ts                            # DB 连接单例 (WAL + FK)
│   │   ├── scanner/
│   │   │   ├── index.ts                            # 媒体库扫描器 (目录遍历+DB写入)
│   │   │   └── nfo-parser.ts                       # NFO XML 解析器
│   │   └── utils.ts                                # shadcn/ui cn() 工具函数
│   ├── providers/
│   │   ├── query-provider.tsx                      # TanStack React Query Provider
│   │   └── session-provider.tsx                    # NextAuth Session Provider
│   ├── types/
│   │   └── next-auth.d.ts                          # NextAuth 类型扩展 (isAdmin, locale)
│   └── middleware.ts                               # 路由保护 (auth.config.ts)
├── data/kubby.db                                   # SQLite 数据库 (gitignored)
├── drizzle/                                        # 迁移文件
├── drizzle.config.ts                               # Drizzle Kit 配置
├── web-design.pen                                  # Pencil MCP 设计稿 (16个页面, 含 Setup Wizard 4页)
├── .env.local                                      # AUTH_SECRET + AUTH_TRUST_HOST
└── next.config.ts                                  # serverExternalPackages, images, next-intl 插件包裹
```

---

## 数据库 Schema

6 张表，SQLite + WAL 模式，文件位于 `data/kubby.db`。

### ER 关系图

```
users ──1:N──> user_movie_data ──N:1──> movies
                                          │
media_libraries ──1:N──> movies ──1:N──> movie_people ──N:1──> people
```

### 表结构

#### users
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| username | text UNIQUE | 登录名 |
| password_hash | text | bcrypt hash |
| display_name | text | 显示名 (可选) |
| is_admin | integer | 布尔值, 首个用户自动为 admin |
| locale | text | 语言偏好, 默认 "en" |
| created_at | text | 时间戳 |

#### media_libraries
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| name | text | 库名 |
| type | text | enum: movie/tvshow/music/book/photo (MVP 仅 movie) |
| folder_path | text | 服务端绝对路径 |
| last_scanned_at | text | 最后扫描时间 |
| created_at | text | 时间戳 |

#### movies
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| title, original_title, sort_name | text | 标题信息 |
| overview, tagline | text | 剧情简介 |
| file_path | text | 视频文件绝对路径 |
| folder_path | text | 电影子目录绝对路径 |
| poster_path, fanart_path, nfo_path | text | **相对于 folder_path** |
| community_rating | real | 评分 (如 8.5) |
| official_rating | text | 分级 (如 PG-13) |
| runtime_minutes | integer | 时长 |
| premiere_date | text | 首映日期 |
| year | integer | 年份 |
| genres | text | JSON 数组字符串 `["Sci-Fi","Action"]` |
| studios | text | JSON 数组字符串 |
| country | text | 国家 |
| tmdb_id, imdb_id | text | 外部 ID (预留) |
| media_library_id | text FK | 所属媒体库 (CASCADE 删除) |
| date_added | text | 入库时间 |

**索引**: media_library_id, year, date_added

> **重要**: poster_path 和 fanart_path 在数据库中存储为相对路径 (如 `poster.jpg`)。API 返回前会 `path.join(folderPath, posterPath)` 解析为绝对路径。

#### people
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| name | text | 姓名 |
| type | text | enum: actor/director/writer/producer |
| photo_path | text | 照片路径 (来自 NFO thumb) |
| tmdb_id | text | 预留 |

**索引**: name

#### movie_people (M:N 关联)
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| movie_id | text FK | CASCADE |
| person_id | text FK | CASCADE |
| role | text | 角色名 (仅演员) |
| sort_order | integer | 排序 |

**索引**: movie_id, person_id

#### user_movie_data
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK | CASCADE |
| movie_id | text FK | CASCADE |
| playback_position_seconds | integer | 播放进度 (秒) |
| play_count | integer | 播放次数 |
| is_played | integer (bool) | 是否已看 |
| is_favorite | integer (bool) | 是否收藏 |
| last_played_at | text | 最后播放时间 |

**唯一索引**: (user_id, movie_id)

---

## API 端点

### 公开端点 (无需登录)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/*` | * | NextAuth 认证 |
| `/api/users` | POST | 注册 (首个用户自动成为 admin) |
| `/api/setup/status` | GET | 检查是否需要首次设置 (`{ needsSetup: boolean }`) |
| `/api/setup/complete` | POST | 完成首次设置 (创建 admin 用户 + 可选创建媒体库, 仅 user count=0 时允许) |

### 需登录端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/movies` | GET | 电影列表 |
| `/api/movies/[id]` | GET | 电影详情 (含 cast/directors/userData) |
| `/api/movies/[id]/stream` | GET | 视频流 (HTTP 206 Range Requests) |
| `/api/movies/[id]/user-data` | GET/PUT | 播放进度/收藏/已看 |
| `/api/people/[id]` | GET | 演员详情 + 参演作品 |
| `/api/users/me` | GET/PUT | 获取/更新个人资料 (displayName, locale) |
| `/api/users/me/password` | PUT | 修改密码 |
| `/api/images/[...path]` | GET | 本地图片服务 (绝对路径) |
| `/api/libraries` | GET | 媒体库列表 |

### 需 Admin 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/libraries` | POST | 创建媒体库 |
| `/api/libraries/[id]` | GET/DELETE | 媒体库详情/删除 |
| `/api/libraries/[id]/scan` | POST | 触发扫描 |
| `/api/filesystem` | GET | 服务端目录浏览 |
| `/api/users` | GET | 用户列表 |
| `/api/dashboard/stats` | GET | 统计数据 |
| `/api/dashboard/activity` | GET | 活动日志 (占位) |

### Movies API 查询参数

`GET /api/movies` 支持以下参数:

| 参数 | 值 | 说明 |
|------|-----|------|
| `libraryId` | UUID | 按媒体库过滤 |
| `search` | string | 标题模糊搜索 (LIKE) |
| `sort` | `title` / `dateAdded` / `releaseDate` / `rating` / `runtime` | 排序方式 |
| `limit` | number | 返回条数 (默认 100) |
| `exclude` | UUID | 排除指定电影 (用于推荐) |
| `filter` | `continue-watching` / `favorites` | 特殊过滤 (需登录, JOIN user_movie_data) |

---

## 认证系统

### 架构拆分

```
auth.config.ts   ← 轻量配置 (无 DB 导入, 供 Edge middleware 使用)
  ├── Credentials provider stub
  ├── JWT/Session callbacks
  └── authorized() 路由权限判断

auth.ts          ← 完整配置 (含 DB 查询, 供 API Routes 使用)
  ├── 继承 auth.config.ts
  └── 覆盖 Credentials provider (bcrypt 密码验证)

middleware.ts    ← 导入 auth.config.ts (Edge 兼容)
```

### 路由权限

| 路径 | 权限 |
|------|------|
| `/login`, `/register` | 公开 |
| `/setup`, `/api/setup` | 公开 |
| `/api/users`, `/api/auth` | 公开 |
| `/dashboard/*` | 需 admin |
| 其他所有 | 需登录 |

### JWT 载荷扩展

```typescript
token.id: string       // 用户 UUID
token.isAdmin: boolean // 管理员标识
token.locale: string   // 语言偏好 (en/zh)
```

---

## 媒体库扫描器

### 扫描流程

```
scanLibrary(libraryId)
  │
  ├── 读取 media_libraries 表获取 folder_path
  ├── 遍历 folder_path 下的子目录
  │   ├── 查找 movie.nfo → 用 fast-xml-parser 解析
  │   ├── 查找视频文件 (.mp4/.mkv/.avi/.wmv/.mov/.flv/.webm/.m4v)
  │   ├── 查找 poster.* 和 fanart.* (.jpg/.jpeg/.png/.webp/.bmp)
  │   ├── 写入/更新 movies 表 (按 folder_path 幂等匹配)
  │   ├── 清除旧的 movie_people 关联
  │   ├── 写入 people 表 (按 name + type 去重)
  │   └── 写入 movie_people 关联 (演员 + 导演)
  └── 更新 media_libraries.last_scanned_at
```

### NFO 解析字段

```
title, originaltitle, plot, tagline, rating, mpaa, runtime,
premiered, year, genre[], studio[], country,
actor[](name/role/thumb/order), director[],
uniqueid(tmdb/imdb)
```

### 期望的目录结构

```
/media/movies/
├── Film1/
│   ├── Film1.mp4          # 视频文件 (任意名, 任意支持格式)
│   ├── movie.nfo          # 元数据 (Kodi/Jellyfin 兼容格式)
│   ├── poster.jpg         # 海报 (任意支持图片格式)
│   └── fanart.jpg         # 背景图 (任意支持图片格式)
├── Film2/
│   ├── Film2.mkv
│   ├── movie.nfo
│   ├── poster.webp
│   └── fanart.png
```

---

## 视频播放

### 服务端

`/api/movies/[id]/stream` 实现 HTTP Range Requests:
- 请求含 `Range: bytes=0-` 时返回 206 Partial Content
- 使用 `fs.createReadStream({ start, end })` 分段读取
- 根据文件扩展名设置 Content-Type

### 客户端

`/movies/[id]/play` 页面:
- HTML5 `<video>` 元素直接播放
- 每 10 秒自动保存播放进度 (`PUT /api/movies/[id]/user-data`)
- 页面加载时从保存位置恢复
- 播放完成自动标记已看 + 更新播放次数
- 控制栏: 拖动进度条, 快进/快退 10s, 音量, 全屏
- 3 秒无操作自动隐藏控制栏

---

## 前端页面

### 路由组布局

```
(auth)   → 无 header, 无 providers (登录/注册)
(setup)  → 无 header, 无 providers, 公开访问 (首次设置向导)
(main)   → SessionProvider + QueryProvider + AppHeader
  └── dashboard/ → + AdminSidebar

根布局 → NextIntlClientProvider (i18n, cookie 驱动语言切换)
```

### 页面列表

| 路由 | 页面 | 关键特性 |
|------|------|---------|
| `/setup` | 欢迎向导 | 4 步: 语言选择 → 创建管理员 → 添加媒体库 → 完成, 首次运行自动跳转 |
| `/login` | 登录 | Server Component 检查首次运行, i18n, 登录后恢复 locale |
| `/register` | 注册 | 同登录风格, 4 字段 + 管理员提示, i18n |
| `/` | 首页 | 媒体库卡片(16:9) + 横向滚动行 |
| `/movies` | 电影浏览 | 过滤工具栏 + 浮动排序下拉 + 响应式网格 |
| `/movies/[id]` | 电影详情 | Jellyfin 风格: fanart 充分可见(仅底部渐变) + 左侧海报(300×450) + 右侧 text-shadow 信息面板(标题/元数据行/小型按钮行/Overview/Metadata 纵向列表) + 演员卡片 + 推荐 |
| `/movies/[id]/play` | 播放器 | 全屏 + 自动保存进度 + 隐藏控制栏 |
| `/people/[id]` | 演员详情 | fanart 渐变 + 大卡片 + 参演作品网格 |
| `/search` | 搜索 | 搜索框 + 电影结果 + 演员结果 |
| `/settings` | 用户设置 | 个人资料 / 密码 / 语言切换 / 账户信息, i18n |
| `/dashboard` | 管理概览 | 4 个统计卡片 + 活动列表 + 快速操作 |
| `/dashboard/libraries` | 媒体库管理 | 库卡片 + Dialog(含FolderPicker) + 扫描/删除 |
| `/dashboard/users` | 用户管理 | 用户列表 + 角色标识 |

### 共享组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `AppHeader` | `components/layout/` | 顶部导航: logo + 导航链接 + 搜索图标 + 头像 |
| `AdminSidebar` | `components/layout/` | 管理侧边栏: 概览/媒体库/用户, 蓝色左边框高亮 |
| `MovieCard` | `components/movie/` | 海报卡片 (180x270), 支持评分/收藏/进度条 |
| `PersonCard` | `components/people/` | 演员卡片 (sm:140x210, md:160x240, lg:240x340) |
| `LibraryCard` | `components/library/` | 媒体库卡片 (320x180), 图标+名称+数量 |
| `FolderPicker` | `components/library/` | 服务端目录浏览器 Dialog |

---

## 主题配色

定义在 `globals.css` 的 `:root` 中, 始终深色模式。

| CSS 变量 | 色值 | 用途 |
|----------|------|------|
| `--background` | `#0a0a0f` | 页面背景 |
| `--foreground` | `#f0f0f5` | 主要文字 |
| `--surface` / `--card` | `#1a1a2e` | 卡片/表面 |
| `--header` / `--muted` | `#111118` | 导航栏/侧边栏 |
| `--input-bg` | `#0f0f1a` | 输入框背景 |
| `--primary` | `#3b82f6` | 主强调色 (蓝) |
| `--secondary` | `#6366f1` | 次强调色 (靛蓝) |
| `--muted-foreground` | `#8888a0` | 次要文字 |
| `--gold` | `#f5c518` | 评分/高亮 |
| `--destructive` | `#ef4444` | 危险操作 |
| `--border` | `rgba(255,255,255,0.06)` | 边框 |
| `--radius` | `0.5rem` (8px) | 基础圆角 |

字体: Inter (通过 `next/font/google` 加载), CJK 回退: PingFang SC → Microsoft YaHei → Noto Sans SC

---

## 配置文件

### next.config.ts
```typescript
// 使用 createNextIntlPlugin 包裹, 指向 src/i18n/request.ts
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl({
  reactCompiler: true,
  images: { unoptimized: true },         // 本地图片走 API 不需要 Next.js 优化
  serverExternalPackages: ["better-sqlite3"], // 避免 Webpack 打包原生模块
});
```

### drizzle.config.ts
```typescript
{
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: { url: "./data/kubby.db" },
}
```

### .env.local
```
AUTH_SECRET=<random-base64>
AUTH_TRUST_HOST=true
```

---

## 国际化 (i18n)

基于 `next-intl`, cookie 驱动 (`NEXT_LOCALE`), 支持中英文双语。

### 架构

```
src/i18n/
├── config.ts          # locales: ["en", "zh"], defaultLocale: "en"
├── request.ts         # getRequestConfig: 从 cookie 读取 locale, 加载对应 JSON
├── locale.ts          # Server Action: setLocale() 写 cookie (1 年有效期)
└── messages/
    ├── en.json        # 英文翻译
    └── zh.json        # 中文翻译
```

### 翻译命名空间

| 命名空间 | 覆盖范围 |
|----------|---------|
| `common` | 通用词汇 (loading/save/cancel/next/back/skip) |
| `auth` | 登录/注册页面 |
| `setup` | 首次设置向导 |
| `nav` | 导航栏 |
| `home` | 首页 |
| `settings` | 设置页面 |
| `dashboard` | 管理后台 |
| `movies` | 电影浏览 |
| `search` | 搜索 |
| `folderPicker` | 文件夹选择器 |

### 语言切换流程

1. **首次设置**: 向导 Step 1 选择语言 → `setLocale()` 写 cookie → `router.refresh()` 即时切换
2. **Settings 页面**: 下拉选择语言 → `setLocale()` + `PUT /api/users/me { locale }` 持久化 → `router.refresh()`
3. **登录后恢复**: 登录成功 → `GET /api/users/me` 获取 locale → `setLocale()` 写 cookie → 跳转

---

## 首次设置向导

访问任意页面时, 若数据库中无用户:
- `/login` 的 Server Component 检测到 user count = 0 → `redirect("/setup")`
- `/setup` 的 Server Component 检测到 user count > 0 → `redirect("/")`

### 向导流程

```
Step 1: 选择语言 (English / 中文) → 写 locale cookie
Step 2: 创建管理员 (username / password / confirm)
Step 3: 添加媒体库 (name / folderPath + FolderPicker) — 可 Skip
Step 4: POST /api/setup/complete → 显示完成 → 跳转 /login
```

---

## 已知限制与扩展预留

### 当前限制
- 仅支持 `movie` 类型媒体库 (schema 已预留其他类型)
- 视频直接播放, 无转码 (依赖浏览器原生编解码支持)
- 搜索仅支持标题模糊匹配, 无全文搜索
- 无字幕支持
- 无远程元数据抓取 (依赖本地 NFO)
- Dashboard 活动日志为占位实现
- i18n 目前仅覆盖 auth/setup/settings 页面, 其余页面待增量翻译

### 预留扩展点
- `media_libraries.type` enum 已包含 tvshow/music/book/photo
- `movies.tmdb_id` / `imdb_id` 预留远程元数据
- 视频流 API 可插入 TranscodeManager 中间层
- Scanner 可扩展为检测 .srt/.ass/.vtt 字幕文件
- 可加 chokidar 实现文件系统监听自动扫描
- i18n 可扩展更多语言 (在 `config.ts` 增加 locale + 添加对应 JSON)

---

## 常用命令

```bash
npm run dev              # 启动开发服务器 (http://localhost:3000)
npm run build            # 生产构建
npx drizzle-kit generate # 生成迁移文件
npx drizzle-kit push     # 推送 schema 到数据库
npx drizzle-kit studio   # 打开 Drizzle Studio (数据库 GUI)
```
