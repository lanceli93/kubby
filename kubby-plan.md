# Kubby - 本地影音系统实施计划

## Context

构建一个名为 "kubby" 的本地自托管影音管理系统，参考 Jellyfin 架构但大幅简化。初始版本仅支持电影媒体库，通过解析本地 NFO 文件获取元数据，支持直接播放本地视频文件。项目从零开始（空工作区），先用 Pencil MCP 完成所有 UI 设计，再进行功能开发。

## 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Next.js (App Router) + TypeScript | 前后端一体 |
| UI 组件 | shadcn/ui + Tailwind CSS | 深色影院风格 |
| 数据库 | SQLite (better-sqlite3) | 本地优先，WAL 模式 |
| ORM | Drizzle ORM | 轻量、TypeScript 友好 |
| 认证 | NextAuth.js v5 (Auth.js) + Credentials | JWT 会话策略 |
| 数据获取 | TanStack React Query | 参考 Jellyfin 前端模式 |
| NFO 解析 | fast-xml-parser | 解析 Kodi/Jellyfin 兼容 NFO |
| 图标 | lucide-react | 与 shadcn/ui 配套 |

## 数据库 Schema

6 张表，参考 Jellyfin 的 BaseItemEntity 模式但简化为独立表：

### users
- `id` (text PK, UUID), `username` (unique), `password_hash`, `display_name`, `is_admin` (bool), `created_at`

### media_libraries
- `id` (text PK), `name`, `type` (enum: movie/tvshow/music/book/photo，MVP 仅实现 movie), `folder_path`, `last_scanned_at`, `created_at`

### movies
- `id` (text PK), `title`, `original_title`, `sort_name`, `overview`, `tagline`
- `file_path` (视频文件绝对路径), `folder_path` (电影子目录绝对路径)
- `poster_path`, `fanart_path`, `nfo_path` (相对于电影子目录)
- `community_rating` (float), `official_rating` (如 PG-13), `runtime_minutes`, `premiere_date`, `year`
- `genres` (JSON array string), `studios` (JSON array string), `country`
- `tmdb_id`, `imdb_id` (预留)
- `media_library_id` (FK -> media_libraries, CASCADE)
- `date_added`

### people
- `id` (text PK), `name`, `type` (actor/director/writer/producer), `photo_path`, `tmdb_id`

### movie_people (多对多关联)
- `id` (text PK), `movie_id` (FK), `person_id` (FK), `role` (角色名), `sort_order`

### user_movie_data (用户交互数据，参考 Jellyfin UserData)
- `id` (text PK), `user_id` (FK), `movie_id` (FK)
- `playback_position_seconds`, `play_count`, `is_played`, `is_favorite`, `last_played_at`
- UNIQUE(user_id, movie_id)

**关键索引**: movies(media_library_id), movies(year), movies(date_added), people(name), movie_people(movie_id), movie_people(person_id), user_movie_data(user_id, movie_id)

**Schema 文件**: `src/lib/db/schema.ts`

## 项目结构

```
kubby/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # 根布局（dark theme, providers）
│   │   ├── page.tsx                  # 首页
│   │   ├── (auth)/login/page.tsx     # 登录
│   │   ├── (auth)/register/page.tsx  # 注册
│   │   ├── movies/page.tsx           # 电影浏览（卡片网格）
│   │   ├── movies/[id]/page.tsx      # 电影详情
│   │   ├── people/[id]/page.tsx      # 演员详情 + 参演作品
│   │   ├── settings/page.tsx         # 用户设置
│   │   ├── dashboard/page.tsx        # 管理控制台
│   │   ├── dashboard/libraries/      # 媒体库管理
│   │   ├── dashboard/users/          # 用户管理
│   │   └── api/                      # API Routes
│   │       ├── auth/[...nextauth]/   # NextAuth
│   │       ├── libraries/            # 媒体库 CRUD + 扫描
│   │       ├── movies/               # 电影列表/详情/流/用户数据
│   │       ├── people/               # 演员列表/详情
│   │       ├── users/                # 用户管理
│   │       └── images/[...path]/     # 本地图片服务
│   ├── components/
│   │   ├── ui/                       # shadcn/ui 组件
│   │   ├── layout/                   # AppHeader, AppSidebar, MainNav
│   │   ├── movie/                    # MovieCard, MovieGrid, MovieDetailHero, CastList
│   │   ├── people/                   # PersonCard, FilmographyGrid
│   │   ├── player/                   # VideoPlayer
│   │   └── library/                  # LibraryCard, CreateLibraryDialog
│   ├── lib/
│   │   ├── db/schema.ts              # Drizzle schema
│   │   ├── db/index.ts               # DB 连接（单例, WAL 模式）
│   │   ├── auth.ts                   # NextAuth 配置
│   │   ├── scanner/index.ts          # 媒体库扫描器
│   │   └── scanner/nfo-parser.ts     # NFO XML 解析器
│   ├── hooks/                        # TanStack Query hooks
│   ├── providers/                    # QueryProvider, SessionProvider, ThemeProvider
│   └── types/                        # TypeScript 类型定义
├── data/kubby.db                     # SQLite 数据库（gitignored）
├── drizzle.config.ts
└── .env.local                        # NEXTAUTH_SECRET
```

## API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/*` | * | NextAuth 认证端点 |
| `/api/libraries` | GET/POST | 列出/创建媒体库 |
| `/api/libraries/[id]` | GET/DELETE | 媒体库详情/删除 |
| `/api/libraries/[id]/scan` | POST | 触发媒体库扫描 |
| `/api/movies` | GET | 电影列表（支持搜索、过滤、排序、分页） |
| `/api/movies/[id]` | GET | 电影详情（含演员、导演、用户数据） |
| `/api/movies/[id]/stream` | GET | 视频文件服务（HTTP 206 Range Requests） |
| `/api/movies/[id]/user-data` | GET/PUT | 播放进度、收藏、已看状态 |
| `/api/people/[id]` | GET | 演员详情 + 参演作品列表 |
| `/api/users` | GET/POST | 用户列表/注册 |
| `/api/images/[...path]` | GET | 本地图片服务（poster/fanart/演员照片） |

**视频服务关键实现**: 支持 HTTP Range Requests (206 Partial Content)，使用 `fs.createReadStream` 分段读取，支持浏览器原生 `<video>` 标签拖动播放。

## 核心功能实现

### NFO 解析器 (`src/lib/scanner/nfo-parser.ts`)
- 使用 fast-xml-parser 解析 XML
- 提取字段: title, originaltitle, plot, tagline, rating, mpaa, runtime, premiered, year, genre[], studio[], country, actor[](name/role/thumb/order), director[], uniqueid(tmdb/imdb)
- 处理单值和数组值（NFO 中 genre 可以是单个或多个）
- 返回强类型 `NfoData` 对象

### 媒体库扫描器 (`src/lib/scanner/index.ts`)
- 遍历媒体库目录的子文件夹
- 每个子文件夹中查找: 视频文件(.mp4/.mkv/.avi/.wmv/.mov 等) + movie.nfo + poster.* + fanart.*
- 解析 NFO -> 写入 movies 表 + people 表 + movie_people 关联
- 人物去重: 按 name (大小写不敏感) + type 匹配
- 幂等操作: 重复扫描按 folder_path 匹配更新已有记录

### 认证系统 (`src/lib/auth.ts`)
- Credentials provider: 用户名 + bcrypt 密码
- JWT 策略（本地系统足够）
- 首个注册用户自动成为管理员，之后开放注册
- Middleware 保护路由: 公开(`/login`, `/register`), 需登录(其他), 需管理员(`/dashboard/*`)

### 视频播放
- HTML5 `<video>` + API Route 提供视频流
- 每 10 秒自动保存播放进度
- 页面加载时从保存位置恢复
- 播放完成标记已看 + 增加播放次数

## 前端页面设计

### 页面列表（深色影院 + 卡片风格）
1. **登录页** - 居中卡片表单，深色背景
2. **注册页** - 类似登录，额外字段
3. **首页** - 横向滚动行: 最近添加、继续观看、收藏
4. **电影浏览页** - 响应式卡片网格 + 过滤/排序栏
5. **电影详情页** - 全宽 fanart 横幅 + poster 叠加 + 元数据 + 横向演员列表
6. **演员详情页** - 演员照片 + 参演作品网格
7. **视频播放** - 全视口深色播放器
8. **用户设置页** - 个人资料 + 密码修改
9. **管理控制台** - 统计卡片 + 快速操作
10. **媒体库管理** - 媒体库卡片 + 创建/扫描/删除

### 电影详情页布局（核心页面）
```
┌──────────────────────────────────────────┐
│            Fanart 横幅 (全宽)             │
│         gradient overlay 渐变遮罩         │
├──────┬───────────────────────────────────┤
│      │  标题 (大号)                       │
│Poster│  原标题 · 年份 · 时长 · 评分       │
│(叠加 │  类型标签  [播放按钮] [收藏]        │
│banner│  ─────────────────────────────────│
│底部) │  剧情简介                          │
├──────┴───────────────────────────────────┤
│  演员列表 (横向滚动, 圆形照片+名字+角色)    │
│  点击跳转 /people/[id]                   │
├──────────────────────────────────────────┤
│  导演/编剧 · 制片厂 · 国家               │
└──────────────────────────────────────────┘
```

## 实施阶段

### 阶段 A: UI 设计（Pencil MCP） ← 最先执行
- 获取 style guide (深色影院风格)
- 设计所有 10 个页面的 UI 模板（详见 `kubby-ui-design-prompts.md`）
- 确认视觉风格统一
- 输出: .pen 设计文件，作为后续前端实现的视觉参考

### 阶段 B: 项目脚手架 + 设计转代码
- `npx create-next-app@latest` 初始化项目
- 安装依赖 (shadcn/ui, drizzle-orm, better-sqlite3, next-auth, @tanstack/react-query, fast-xml-parser, bcryptjs, lucide-react)
- 配置 Tailwind 深色主题（配色从 Pencil 设计稿提取）
- 使用 Pencil 的 code guidelines 将 .pen 设计转为 shadcn/ui + Tailwind 组件代码
- 配置 Drizzle + SQLite
- 定义数据库 Schema + 运行迁移
- 配置 NextAuth

### 阶段 C: 后端开发
- NFO 解析器
- 媒体库扫描器
- 所有 API Routes (媒体库、电影、演员、用户数据、视频/图片服务)
- 认证中间件

### 阶段 D: 前端开发
- Providers + 根布局
- TanStack Query hooks
- 所有页面实现（基于阶段 B 转出的组件代码）
- 视频播放器组件

### 阶段 E: 用户数据 + 打磨
- 播放进度追踪
- 收藏 + 已看状态
- 搜索功能
- 响应式适配
- 加载/错误状态

## 扩展预留（MVP 不实现）

- **媒体库类型**: schema 中 type enum 已预留 tvshow/music/book/photo
- **转码**: 视频 API 可在未来插入 TranscodeManager 中间层
- **远程元数据**: 可扩展为 TMDb/OMDb API provider
- **文件系统监听**: 可加 chokidar 实现自动感知
- **字幕支持**: 检测 .srt/.ass/.vtt 文件
- **插件系统**: 模块化扫描器架构为插件扩展铺路

## 验证方式

1. **数据库**: 运行 `npx drizzle-kit studio` 查看表结构和数据
2. **扫描**: 准备测试电影目录（含 NFO + poster + fanart），触发扫描后验证 DB 数据
3. **API**: 使用浏览器或 curl 测试各端点返回数据
4. **播放**: 在浏览器中播放视频，验证拖动进度条（Range Request）正常
5. **认证**: 测试注册、登录、权限控制（普通用户不能访问 /dashboard）
6. **UI**: 在浏览器中查看所有页面，验证深色主题和卡片布局
