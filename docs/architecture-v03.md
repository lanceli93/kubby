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
| 3D 渲染 | Three.js (360° 全景播放) | 0.175.x |
| 运行时 | Node.js | 25.x |

---

## 项目目录结构

```
kubby/
├── src/
│   ├── app/
│   │   ├── layout.tsx                              # 根布局 (async, Inter 字体, NextIntlClientProvider, 动态 lang)
│   │   ├── globals.css                             # Tailwind v4 + 深色影院主题变量 + CJK 字体回退 + glass-flash 动效
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
│   │   │   ├── layout.tsx                          # SessionProvider + QueryProvider + AppHeader + BottomTabs (移动端)
│   │   │   ├── page.tsx                            # 首页 (Now Showing Hero + Ambilight 光场 + 悬浮药丸 Tabs: Home=媒体库/继续观看/最近添加/收藏, Favorites=收藏网格)
│   │   │   ├── movies/
│   │   │   │   ├── page.tsx                        # 媒体库浏览 (Tabs: Movies=网格+排序, Favorites=收藏网格, Genres=按类型ScrollRow)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx                    # 电影详情 (fanart+poster+元数据+书签+演员+推荐)
│   │   │   │       └── play/page.tsx               # 视频播放器编排 (hook 接线, 键盘快捷键, 数据获取)
│   │   │   ├── people/[id]/page.tsx                # 演员详情 (fanart+大卡片+参演作品)
│   │   │   ├── search/page.tsx                     # 搜索结果 (电影+演员)
│   │   │   ├── profile/page.tsx                    # 个人资料 (头像/用户名/密码/账户类型)
│   │   │   ├── preferences/                        # 用户偏好 (PreferencesSidebar 子导航)
│   │   │   │   ├── layout.tsx                      # PreferencesSidebar 布局
│   │   │   │   ├── page.tsx                        # 重定向到 card-badges
│   │   │   │   ├── card-badges/page.tsx            # 卡片标记设置 (分辨率/评分/Tier 角标开关)
│   │   │   │   ├── ratings-bookmarks/page.tsx      # 评分维度/书签图标管理/快速书签模板/低调标记
│   │   │   │   ├── playback/page.tsx               # 外部播放器设置 (IINA/PotPlayer/Web Player)
│   │   │   │   └── language/page.tsx               # 语言切换 (en/zh)
│   │   │   └── dashboard/                          # 管理后台 (需 admin 权限)
│   │   │       ├── layout.tsx                      # 透传布局 (仅路由分组)
│   │   │       ├── libraries/page.tsx              # 媒体库管理 (独立页面, 无子导航)
│   │   │       ├── users/page.tsx                  # 用户管理 (独立页面, 无子导航)
│   │   │       └── (system)/                       # 系统管理 (AdminSidebar 子导航)
│   │   │           ├── layout.tsx                  # AdminSidebar 布局
│   │   │           ├── page.tsx                    # 系统概览 (统计+活动+快速操作)
│   │   │           └── networking/page.tsx         # 网络设置 (端口/Docker 检测)
│   │   │   └── metadata/
│   │   │       ├── scraper/page.tsx                  # 元数据提供者 (TMDB API key + NFO 回写开关)
│   │   │       └── browse/page.tsx                   # 元数据浏览器 (影片/演员卡片网格, 过滤+搜索+无限滚动, 一键编辑)
│   │   └── api/                                    # API Routes (共 26+ 个端点)
│   │       ├── auth/[...nextauth]/route.ts         # NextAuth 端点
│   │       ├── dashboard/
│   │       │   ├── stats/route.ts                  # GET 管理统计
│   │       │   └── activity/route.ts               # GET 最近活动 (占位)
│   │       ├── filesystem/route.ts                 # GET 服务端目录浏览
│   │       ├── images/[...path]/route.ts           # GET 本地图片服务 (路径遍历按段检查, 支持含..的文件名)
│   │       ├── libraries/
│   │       │   ├── route.ts                        # GET 列表 / POST 创建
│   │       │   └── [id]/
│   │       │       ├── route.ts                    # GET 详情 / DELETE 删除
│   │       │       └── scan/route.ts               # POST 触发扫描 (SSE: progress+title, done+skipped)
│   │       ├── movies/
│   │       │   ├── route.ts                        # GET 列表 (搜索/过滤/排序/分页/genre/includeGenres)
│   │       │   ├── genres/route.ts                 # GET 按媒体库去重的类型列表
│   │       │   └── [id]/
│   │       │       ├── route.ts                    # GET 详情 (含演员/导演/userData)
│   │       │       ├── stream/route.ts             # GET 视频流 (HTTP 206 Range)
│   │       │       ├── stream/decide/route.ts      # GET 播放决策 (direct/remux/transcode)
│   │       │       ├── frame/route.ts                # GET 单帧提取 (FFmpeg -ss, JPEG, ?t=&disc=&maxWidth=)
│   │       │       ├── play-external/route.ts       # POST 启动外部播放器 (debug cmd 日志)
│   │       │       └── user-data/route.ts          # GET/PUT 播放进度/收藏/已看
│   │       ├── stream/[sessionId]/                  # HLS 转码 session 端点
│   │       │   ├── route.ts                        # DELETE 停止 / POST seek
│   │       │   ├── playlist.m3u8/route.ts          # GET HLS 播放列表
│   │       │   └── segment/[name]/route.ts         # GET HLS 分段文件
│   │       ├── people/[id]/
│   │       │   ├── route.ts                        # GET/PUT 演员详情+参演作品
│   │       │   └── gallery/route.ts                # GET/POST/DELETE 演员照片墙
│   │       ├── metadata/
│   │       │   └── incomplete/route.ts               # GET 元数据浏览+过滤 (type/missing/search/page/limit)
│   │       ├── settings/
│   │       │   └── nfo-writeback/route.ts            # GET/PUT NFO 回写开关 (settings 表 key-value)
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
│   │   │   ├── app-header.tsx                      # 顶部导航栏 (logo+导航+搜索+头像, 响应式 px-3/md:px-8)
│   │   │   ├── bottom-tabs.tsx                     # 移动端底部 Tab 栏 (Home/Movies/Search/Preferences, md:hidden)
│   │   │   ├── admin-sidebar.tsx                   # 系统管理子导航 (Overview/Networking)
│   │   │   ├── preferences-sidebar.tsx             # 偏好设置子导航 (Card Badges/Ratings & Bookmarks/Playback/Language)
│   │   │   └── nav-sidebar.tsx                     # 汉堡菜单侧边栏 (Home/Media/Admin/User)
│   │   ├── movie/
│   │   │   ├── movie-card.tsx                      # 电影海报卡片 (2:3, 180x270, responsive 模式支持 w-full+aspect-[2/3])
│   │   │   ├── bookmark-card.tsx                   # 书签缩略图卡片 (320px, 编辑/删除/图标)
│   │   │   ├── frame-scrubber.tsx                  # 帧浏览器面板 (两栏布局, 截图到相册, 书签创建)
│   │   │   └── movie-metadata-editor.tsx           # 电影元数据编辑弹窗 (General/Cast/Images/Personal 四 Tab, 800px)
│   │   ├── people/
│   │   │   ├── person-card.tsx                     # 演员卡片 (sm/md/lg 三种尺寸)
│   │   │   └── person-metadata-editor.tsx          # 人物元数据编辑弹窗 (General/Images/Personal 三 Tab, 800px, deathDate 隐藏)
│   │   ├── library/
│   │   │   ├── library-card.tsx                    # 媒体库卡片 (16:9, 320x180)
│   │   │   └── folder-picker.tsx                   # 服务端文件夹选择器弹窗
│   │   ├── player/
│   │   │   ├── player-controls.tsx                  # 底部控制栏 (分组: 书签|模式|播放设置|系统, chip样式文本按钮, 竖线分隔); 移动端右侧面板 (倍速/跳转秒数/分辨率)
│   │   │   ├── player-overlays.tsx                  # 叠加层 (OSD/帮助/书签面板/中央播放按钮); 移动端双击跳转逻辑在 play/page.tsx
│   │   │   ├── player-top-bar.tsx                   # 顶部栏 (返回/标题/碟片计数/帮助)
│   │   │   └── panorama-360-player.tsx              # Three.js 360° 全景播放器 (球体+VideoTexture+拖拽/缩放)
│   │   └── ui/                                     # shadcn/ui 组件 + 自定义组件 (18个)
│   │       ├── avatar.tsx, badge.tsx, button.tsx, card.tsx
│   │       ├── dialog.tsx, dropdown-menu.tsx, input.tsx, label.tsx
│   │       ├── progress.tsx, scroll-area.tsx, scroll-row.tsx, select.tsx
│   │       ├── separator.tsx, slider.tsx, switch.tsx, tabs.tsx
│   │       ├── textarea.tsx
│   │       └── glass-toast.tsx                     # 玻璃风格 Toast (全站统一, 居中底部/顶部)
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
│   │   │   ├── schema.ts                           # Drizzle schema (13 张表, 含 settings + user_preferences + bookmarks)
│   │   │   └── index.ts                            # DB 连接 (Proxy 懒初始化, WAL + FK + 自动迁移)
│   │   ├── folder-paths.ts                         # 多文件夹路径 parse/serialize 辅助工具 (向后兼容 JSON 数组存储)
│   │   ├── scanner/
│   │   │   ├── index.ts                            # 媒体库扫描器 (多路径遍历+TMDB刮削+DB写入+跳过追踪)
│   │   │   ├── nfo-parser.ts                       # NFO XML 解析器
│   │   │   └── nfo-writer.ts                       # NFO 生成/回写 (完整 NFO 生成 + 追加 actor)
│   │   ├── transcode/
│   │   │   ├── hw-accel.ts                         # 硬件编码器检测 (VideoToolbox/NVENC/libx264)
│   │   │   ├── playback-decider.ts                 # 播放决策 (direct/remux/transcode)
│   │   │   ├── ffmpeg-command.ts                   # FFmpeg HLS 命令构建 (支持硬件编码器参数)
│   │   │   └── transcode-manager.ts                # FFmpeg 进程管理单例 (globalThis 模式, 硬件编码失败自动降级)
│   │   ├── scraper/
│   │   │   ├── index.ts                            # TMDB 刮削器 (搜索+详情+下载图片+生成NFO)
│   │   │   └── folder-parser.ts                    # 电影文件夹名解析 ("Inception (2010)" → {title, year})
│   │   ├── bookmark-icons.ts                        # 内置书签图标定义 (9 个 Lucide 图标, 含颜色/选中态)
│   │   ├── paths.ts                                 # 集中路径管理 (KUBBY_DATA_DIR 环境变量支持)
│   │   ├── tmdb.ts                                 # TMDb API 客户端 (search/details/credits/图片下载/API key验证)
│   │   └── utils.ts                                # shadcn/ui cn() 工具函数
│   ├── hooks/
│   │   ├── use-mobile.ts                           # useIsMobile hook (matchMedia max-width:767px, 与 Tailwind md: 断点同步)
│   │   ├── use-playback-session.ts                 # HLS/直接播放生命周期, seek, 心跳, 清理 (可复用于 VR/360)
│   │   ├── use-progress-save.ts                    # 自动保存播放进度 (10 秒间隔 + 按需保存)
│   │   └── use-user-preferences.ts                 # 用户偏好 React Query hook (评分维度/卡片标记/书签配置)
│   ├── providers/
│   │   ├── query-provider.tsx                      # TanStack React Query Provider
│   │   ├── session-provider.tsx                    # NextAuth Session Provider
│   │   └── scan-provider.tsx                       # 全局扫描状态 (SSE 进度+title+skipped, 跨组件共享)
│   ├── types/
│   │   └── next-auth.d.ts                          # NextAuth 类型扩展 (isAdmin, locale)
│   └── middleware.ts                               # 路由保护 (auth.config.ts)
├── data/kubby.db                                   # SQLite 数据库 (gitignored)
├── drizzle/                                        # 迁移文件
├── drizzle.config.ts                               # Drizzle Kit 配置
├── web-design.pen                                  # Pencil MCP 设计稿 (16个页面, 含 Setup Wizard 4页)
├── scripts/
│   ├── enrich-nfo.ts                               # 独立脚本: TMDb 演员数据 → 下载头像 → 回写 NFO
│   └── package.ts                                  # 打包脚本: standalone + Node.js + ffprobe + Go launcher
├── launcher/                                        # Go 启动器 (系统托盘 + 子进程管理)
│   ├── main.go                                      # 入口: 启动 server → 浏览器 → 托盘
│   ├── server.go                                    # Node.js 子进程管理
│   ├── tray.go                                      # 系统托盘
│   └── paths.go, config.go, secret.go, browser.go
├── .env.local                                       # AUTH_SECRET + AUTH_TRUST_HOST (+ 可选 TMDB_API_KEY)
├── .github/workflows/release.yml                    # CI: 跨平台构建 + GitHub Release
└── next.config.ts                                   # standalone + serverExternalPackages + next-intl
```

---

## 数据库 Schema

13 张表，SQLite + WAL 模式，文件位于 `data/kubby.db`。

### ER 关系图

```
users ──1:N──> user_movie_data ──N:1──> movies
users ──1:N──> user_person_data ──N:1──> people
users ──1:1──> user_preferences
users ──1:N──> movie_bookmarks ──N:1──> movies
users ──1:N──> bookmark_icons
                                          │
media_libraries ──1:N──> movies ──1:N──> movie_people ──N:1──> people
                                   │
                                   ├──1:N──> movie_discs
                                   └──1:N──> media_streams

settings (独立 key-value 表, 用于全局配置如 TMDB API key)
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

#### settings (key-value 全局配置)
| 列 | 类型 | 说明 |
|----|------|------|
| key | text PK | 配置项名称 (如 `tmdb_api_key`) |
| value | text | 配置值 |

#### media_libraries
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| name | text | 库名 |
| type | text | enum: movie/tvshow/music/book/photo (MVP 仅 movie) |
| folder_path | text | 服务端绝对路径 |
| scraper_enabled | integer (bool) | 是否启用 TMDB 刮削器 |
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
| video_codec, audio_codec | text | 编解码器 |
| video_width, video_height | integer | 视频分辨率 |
| audio_channels | integer | 音频声道数 |
| container | text | 容器格式 (mkv, mp4 等) |
| total_bitrate | integer | 总码率 (bps) |
| file_size | integer | 文件大小 (bytes) |
| format_name | text | 格式名称 |
| disc_count | integer | 碟数, 默认 1 |
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
| photo_path | text | 照片路径 (**相对于 KUBBY_DATA_DIR**, 如 `metadata/people/A/Actor/photo.jpg`) |
| photo_mtime | real | 照片修改时间 (缓存失效用) |
| photo_blur | text | 照片模糊占位图 (base64 data URL) |
| fanart_path | text | 自有背景图路径 (相对于 KUBBY_DATA_DIR, 不含影片回退) |
| height | integer | 身高 (cm) |
| weight | integer | 体重 (kg) |
| measurements | text | 三围 (如 "88-60-90") |
| cup_size | text | 罩杯 (如 "C") |
| whr | real | 腰臀比 (从三围自动计算) |
| tmdb_id | text | TMDB ID |
| overview | text | 简介 |
| birth_date | text | 出生日期 (YYYY-MM-DD) |
| birth_year | integer | 出生年份 |
| place_of_birth | text | 出生地 |
| death_date | text | 逝世日期 |
| imdb_id | text | IMDb ID |
| tags | text | 标签 (JSON 数组) |
| date_added | text | 添加时间 |

**索引**: name

#### movie_people (M:N 关联)
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| movie_id | text FK | CASCADE |
| person_id | text FK | CASCADE |
| role | text | 角色名 (仅演员) |
| sort_order | integer | 排序 |
| age_at_release | integer | 出演时年龄 (从 birthDate/birthYear + premiereDate/year 自动计算) |

**索引**: movie_id, person_id

> **ageAtRelease 自动计算**: scanner 扫描时计算; 编辑演员 birthDate/birthYear 时重算所有关联影片; 编辑影片 year/premiereDate 时重算所有演员。优先用 birthDate 年份, fallback 到 birthYear。

#### user_movie_data
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK | CASCADE |
| movie_id | text FK | CASCADE |
| playback_position_seconds | integer | 播放进度 (秒) |
| current_disc | integer | 当前碟片 (多碟恢复), 默认 1 |
| play_count | integer | 播放次数 |
| is_played | integer (bool) | 是否已看 |
| is_favorite | integer (bool) | 是否收藏 |
| personal_rating | real | 个人评分 (0-10) |
| dimension_ratings | text | JSON 对象, 各维度评分 (如 `{"剧情": 9.5, "特效": 8.0}`) |
| last_played_at | text | 最后播放时间 |

**唯一索引**: (user_id, movie_id)

#### user_person_data
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK | CASCADE |
| person_id | text FK | CASCADE |
| personal_rating | real | 个人评分 (0-10) |
| dimension_ratings | text | JSON 对象, 各维度评分 (如 `{"样貌": 9.0, "演技": 8.5}`) |

**唯一索引**: (user_id, person_id)

#### user_preferences
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK UNIQUE | CASCADE |
| movie_rating_dimensions | text | JSON 数组, 电影评分自定义维度 |
| person_rating_dimensions | text | JSON 数组, 人物评分自定义维度 |
| show_movie_rating_badge | integer (bool) | 是否在电影卡片显示个人评分, 默认 true |
| show_person_tier_badge | integer (bool) | 是否在人物卡片显示评级标记, 默认 true |
| show_person_rating_badge | integer (bool) | 是否显示人物评分标记, 默认 true |
| show_resolution_badge | integer (bool) | 是否显示分辨率标记, 默认 true |
| external_player_enabled | integer (bool) | 是否启用外部播放器, 默认 false |
| external_player_name | text | 外部播放器名称 (IINA/PotPlayer) |
| external_player_path | text | 外部播放器路径 |
| external_player_mode | text | 外部播放器模式: "local" / "stream" |
| disabled_bookmark_icons | text | JSON 数组, 禁用的书签图标 ID 列表 |
| quick_bookmark_template | text | JSON 对象, 快速书签预设 `{ iconType?, tags?, note? }` |
| subtle_bookmark_markers | integer (bool) | 进度条书签标记是否使用半透明白色, 默认 false |
| player_360_mode | integer (bool) | 360° 全景播放模式开关, 默认 false |
| movie_dimension_weights | text | JSON 对象, 电影维度权重 (如 `{"剧情":2,"特效":1}`), 默认全 1 |
| person_dimension_weights | text | JSON 对象, 人物维度权重, 默认全 1 |
| hero_mosaic_config | text | JSON `HeroMosaicConfig`, 首页海报墙配置 (列数/风格/角度/滚动方向/媒体库占比/年份/分辨率筛选), NULL = 默认 |

#### movie_discs (多碟电影)
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| movie_id | text FK | CASCADE |
| disc_number | integer | 碟号 (1, 2, 3…) |
| file_path | text | 视频文件绝对路径 |
| label | text | 标签 (如 "CD 1", "PART 2") |
| poster_path | text | 碟片海报 (相对于 movie folder_path, 可空) |
| runtime_seconds | integer | 时长 (秒) |
| file_size | integer | 文件大小 |
| video_codec, audio_codec | text | 编解码器 |
| video_width, video_height | integer | 分辨率 |
| audio_channels | integer | 声道数 |
| container | text | 容器格式 |
| total_bitrate | integer | 总码率 |
| format_name | text | 格式名称 |

**索引**: movie_id, (movie_id, disc_number)

#### media_streams (逐流媒体信息)
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| movie_id | text FK | CASCADE |
| disc_number | integer | 所属碟片, 默认 1 |
| stream_index | integer | 流序号 |
| stream_type | text | enum: video/audio/subtitle |
| codec, profile | text | 编解码器和配置 |
| bitrate | integer | 码率 |
| language, title | text | 语言和标题 |
| is_default, is_forced | integer (bool) | 默认/强制标记 |
| width, height | integer | 视频分辨率 |
| bit_depth | integer | 位深 |
| frame_rate | text | 帧率 |
| hdr_type | text | HDR 类型 (Dolby Vision, HDR10, HLG) |
| channels | integer | 声道数 |
| channel_layout | text | 声道布局 |
| sample_rate | integer | 采样率 |

**索引**: movie_id, (movie_id, stream_type)

#### movie_bookmarks
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK | CASCADE |
| movie_id | text FK | CASCADE |
| timestamp_seconds | integer | 书签时间戳 (秒) |
| disc_number | integer | 碟片号, 默认 1 |
| icon_type | text | 图标 ID (内置如 "bookmark"/"star" 或自定义图标 UUID) |
| tags | text | JSON 数组, 用户标签 |
| note | text | 用户备注 |
| thumbnail_path | text | 视频截图绝对路径 |
| view_state | text | JSON `{lon, lat, fov}`, 360° 书签的相机视角 (可空) |
| created_at | text | 时间戳 |

**索引**: (user_id, movie_id), movie_id

#### bookmark_icons (自定义用户上传图标)
| 列 | 类型 | 说明 |
|----|------|------|
| id | text PK | UUID |
| user_id | text FK | CASCADE |
| label | text | 图标名称 |
| image_path | text | 图标文件绝对路径 (64×64 PNG) |
| dot_color | text | 进度条圆点颜色 (hex), 默认 "#ffffff" |
| created_at | text | 时间戳 |

**索引**: user_id

### 自定义评分维度：设计决策

#### 需求

用户可自定义多个评分维度（如电影的"剧情"、"特效"，人物的"样貌"、"演技"），每个维度独立打分，`personal_rating` 为各维度的加权平均值。每个维度可配置权重（x0.5~x3.0，默认 x1.0）。维度支持重命名（批量更新已有评分 JSON key）、排序（数组顺序即显示顺序）、删除（带使用量确认）。维度定义和权重按用户存储。

#### 方案选型

| | JSON 列 (当前方案) | EAV 表 | 动态字段 |
|---|---|---|---|
| 实现方式 | `dimension_ratings TEXT` 存 JSON 对象 | 独立表，每维度一行 (target_id, dimension_name, value) | ALTER TABLE 动态加列 |
| 读写复杂度 | 一次读写整个对象 | 多行 INSERT/SELECT | 需要 DDL 操作 |
| 按维度查询/排序 | `json_extract()` | SQL 原生 WHERE/ORDER BY | SQL 原生 |
| Schema 变更 | 无需迁移 | 无需迁移 | 每次用户改配置都需 DDL |
| 适用场景 | 维度少、主要整体读写 | 需频繁按维度聚合分析 | 不适用于用户级自定义 |

**选择 JSON 列的理由：**

1. **读写模式匹配** — 评分场景以整体读写为主（打开弹窗读取所有维度 → 修改 → 整体保存），而非逐维度操作
2. **用户级自定义** — 每个用户维度不同，动态字段方案不可行；EAV 的多行操作在此场景下过度设计
3. **数据量可控** — 个人媒体库通常数百到数千条记录，维度上限 10 个，JSON 解析开销可忽略
4. **未来按维度排序可行** — SQLite 原生支持 `json_extract()`，可直接用于 ORDER BY：

```sql
SELECT m.*, json_extract(umd.dimension_ratings, '$.剧情') AS plot_score
FROM movies m
JOIN user_movie_data umd ON umd.movie_id = m.id
WHERE umd.user_id = ? AND plot_score IS NOT NULL
ORDER BY plot_score DESC;
```

若未来数据量增长需要优化，可对 JSON 路径建表达式索引：

```sql
CREATE INDEX idx_dim_plot ON user_movie_data(json_extract(dimension_ratings, '$.剧情'));
```

#### 数据流

```
user_preferences.movie_rating_dimensions = '["剧情","特效"]'   ← 维度定义 (数组顺序 = 显示顺序)
user_preferences.movie_dimension_weights  = '{"剧情":2}'       ← 维度权重 (缺省为 1)
                        ↓ (前端读取维度列表 + 权重，渲染评分 UI)
user_movie_data.dimension_ratings = '{"剧情":9.5,"特效":8.0}' ← 各维度评分
user_movie_data.personal_rating = 9.0                          ← 加权平均: (9.5×2+8.0×1)/(2+1)
```

`personal_rating` 作为冗余字段始终保持与维度加权平均值同步，确保无维度配置的场景（卡片排序、徽章显示）无需解析 JSON。保存偏好设置时自动批量重算所有已有评分。维度重命名时使用应用层 read-modify-write 批量更新 JSON key。

---

## API 端点

### 公开端点 (无需登录)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/*` | * | NextAuth 认证 |
| `/api/users` | POST | 注册 (首个用户自动成为 admin; 之后需 admin 认证) |
| `/api/setup/status` | GET | 检查是否需要首次设置 (`{ needsSetup: boolean }`) |
| `/api/setup/complete` | POST | 完成首次设置 (创建 admin 用户 + 可选创建媒体库, 仅 user count=0 时允许) |

### 需登录端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/movies` | GET | 电影列表 (支持 genre/includeGenres 参数) |
| `/api/movies/hero-wall` | GET | 首页海报墙影片池: 按 hero_mosaic_config 做媒体库加权随机采样 + 年份/分辨率/风格筛选; 参数 style/yearFrom/yearTo/minWidth/weights/limit 可覆盖已存配置 (偏好页实时预览用) |
| `/api/movies/genres` | GET | 按媒体库去重的类型列表 (参数: libraryId) |
| `/api/movies/[id]` | GET/DELETE | 电影详情 / 删除电影 (含 cast/directors/userData) |
| `/api/movies/[id]/stream` | GET | 视频流 (HTTP 206 Range Requests) |
| `/api/movies/[id]/user-data` | GET/PUT | 播放进度/收藏/已看 |
| `/api/people/[id]` | GET | 演员详情 + 参演作品 |
| `/api/people/[id]/gallery` | GET/POST/DELETE | 照片墙: 列表/上传/删除图片 |
| `/api/people/[id]/user-data` | GET/PUT | 演员个人评分/维度评分 |
| `/api/movies/[id]/frame` | GET | 单帧提取 (`?t=SECONDS&disc=N&maxWidth=W`, FFmpeg -ss, JPEG, 10s timeout) |
| `/api/movies/[id]/bookmarks` | GET/POST | 书签列表 / 创建书签 (含截图上传) |
| `/api/movies/[id]/bookmarks/[bookmarkId]` | PUT/DELETE | 更新/删除书签 |
| `/api/movies/[id]/play-external` | POST | 服务端启动外部播放器 (本地模式) |
| `/api/settings/personal-metadata` | GET/PUT | 用户偏好设置 (评分维度/权重/卡片标记/书签配置); PUT 支持 `renamedDimensions` 批量重命名, 保存时自动重算所有 personalRating |
| `/api/settings/dimension-usage` | GET | 查询维度使用量 (`?type=movie\|person&name=xxx`), 用于删除确认提示 |
| `/api/settings/bookmark-icons` | GET/POST | 自定义书签图标列表 / 上传新图标 |
| `/api/settings/bookmark-icons/[iconId]` | PUT/DELETE | 更新/删除自定义图标 |
| `/api/users/me` | GET/PUT | 获取/更新个人资料 (displayName, locale) |
| `/api/users/me/password` | PUT | 修改密码 |
| `/api/images/[...path]` | GET | 本地图片服务 (绝对路径) |
| `/api/libraries` | GET | 媒体库列表 |

### 需 Admin 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/settings/scraper` | GET/PUT | TMDB API 密钥管理 (GET 返回掩码密钥, PUT 验证并保存) |
| `/api/settings/nfo-writeback` | GET/PUT | NFO 回写开关 (默认开启, 关闭后编辑元数据不回写 NFO) |
| `/api/metadata/incomplete` | GET | 不完整元数据查询 (?type=movies\|people&missing=overview,date,photo&page=&limit=) |
| `/api/libraries` | POST | 创建媒体库 (含 scraperEnabled) |
| `/api/libraries/[id]` | GET/DELETE | 媒体库详情/删除 |
| `/api/libraries/[id]/scan` | POST | 触发扫描 |
| `/api/filesystem` | GET | 服务端目录浏览 |
| `/api/users` | GET | 用户列表 (需 admin) |
| `/api/users/[id]` | PUT/DELETE | 管理用户 (改角色/重置密码/删除, 需 admin, 末位管理员保护) |
| `/api/dashboard/stats` | GET | 统计数据 |
| `/api/dashboard/activity` | GET | 活动日志 (占位) |

### Movies API 查询参数

`GET /api/movies` 支持以下参数:

| 参数 | 值 | 说明 |
|------|-----|------|
| `libraryId` | UUID | 按媒体库过滤 (favorites 模式同样支持) |
| `search` | string | 标题模糊搜索 (LIKE) |
| `sort` | `title` / `dateAdded` / `releaseDate` / `rating` / `runtime` / `fileSize` / `resolution` / `personalRating` | 排序方式 |
| `sortDimension` | string | 按自定义评分维度排序 (配合 `sort=personalRating`) |
| `limit` | number | 返回条数 (默认 100) |
| `exclude` | UUID | 排除指定电影 (用于推荐) |
| `filter` | `continue-watching` / `favorites` | 特殊过滤 (需登录, JOIN user_movie_data) |
| `genre` | string | 按类型过滤 (LIKE 匹配 JSON 数组字段) |
| `includeGenres` | `true` | 返回解析后的 genres 数组 (用于 Genres Tab 客户端分组) |

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
| `/api/users` (POST, 首用户) | 公开 (设置流程); 之后需 admin |
| `/api/auth` | 公开 |
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
scanLibrary(libraryId, onProgress?)
  │
  ├── 读取 media_libraries 表获取 folder_path + scraper_enabled
  ├── 若 scraper_enabled, 从 settings 表加载 TMDB API key
  ├── 预计数所有子目录 → dirs[] (用于 progress total)
  ├── 遍历 dirs, 每 5% 发送 onProgress({ current, total, title })
  │   ├── 若无 movie.nfo 且 scraper 启用 → 调用 scrapeMovie()
  │   │   ├── 解析文件夹名 → { title, year }
  │   │   ├── TMDB searchMovie() → 选最佳匹配
  │   │   ├── TMDB getMovieDetails() → 完整元数据+credits
  │   │   ├── 下载 poster.jpg + fanart.jpg + 演员头像
  │   │   └── 生成 movie.nfo (Kodi/Jellyfin 兼容)
  │   ├── 无 NFO → skipped.push({ name, reason: 'no_nfo' }), continue
  │   ├── 查找 movie.nfo → 用 fast-xml-parser 解析
  │   │   └── 解析失败 → skipped.push({ name, reason: 'nfo_parse_error' }), continue
  │   ├── 查找视频文件 → 无视频 → skipped.push({ name, reason: 'no_video' }), continue
  │   ├── 查找 poster.* 和 fanart.* (.jpg/.jpeg/.png/.webp/.bmp)
  │   ├── 写入/更新 movies 表 (按 folder_path 幂等匹配)
  │   ├── 清除旧的 movie_people 关联
  │   ├── 写入 people 表 (按 name + type 去重)
  │   └── 写入 movie_people 关联 (演员 + 导演)
  ├── 清理已不存在的电影 → removedCount
  ├── 更新 media_libraries.last_scanned_at
  └── 返回 { scannedCount, removedCount, skipped[] }
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

### 人物元数据目录结构

```
data/metadata/people/
├── T/
│   └── Timothée Chalamet/
│       ├── photo.jpg              # 主照片 (由 TMDB 刮削器下载)
│       └── gallery/               # 照片墙 (用户上传)
│           ├── 001.jpg
│           ├── 002.webp
│           └── 003.avif
├── S/
│   └── Scarlett Johansson/
│       ├── photo.jpg
│       └── gallery/
```

人物目录按姓名首字母分组, `gallery/` 子目录由照片墙功能自动创建, 文件自动编号 (001, 002, ...), 保留原始扩展名。支持格式: jpg, jpeg, png, webp, avif。

### 书签元数据目录结构

```
data/metadata/
├── bookmarks/{userId}/{movieId}/      # 书签视频截图
│   ├── {bookmarkId}.jpg
│   └── ...
└── bookmark-icons/{userId}/           # 自定义书签图标 (64×64 PNG)
    ├── {iconId}.png
    └── ...
```

---

## 视频播放

### HLS 转码架构

```
Player (page.tsx)
  │
  ├── GET /api/movies/{id}/stream/decide?disc=N
  │     → decidePlayback({ container, videoCodec, audioCodec })
  │     → "direct" | "remux" | "transcode"
  │
  ├── Direct Play: video.src = /api/movies/{id}/stream
  │
  └── HLS Play (remux/transcode):
        ├── TranscodeManager.startSession() → spawns FFmpeg
        ├── HLS.js → loadSource(/api/stream/{session}/playlist.m3u8)
        ├── Segments served via /api/stream/{session}/segment/{name}
        └── Session cleanup on unmount/beforeunload → DELETE /api/stream/{session}
```

**决策逻辑** (`src/lib/transcode/playback-decider.ts`):
- **direct**: MP4+H.264/HEVC+AAC, WebM+VP8/VP9+Opus — 浏览器原生播放
- **remux**: 浏览器兼容编码但容器不支持 (MKV/MOV/TS+H.264) — copy streams to HLS
- **transcode**: 编码不兼容 (mpeg4/wmv2/flv1 等) — 重编码为 H.264+AAC HLS

**iOS/移动端播放决策覆盖** (`stream/decide/route.ts`, 客户端发 `noHevc=1`):
- HEVC 任意分辨率 → **remux** (stream copy 到 HLS fMP4, iOS 原生 HEVC 硬解)
- H.264 > 4K → **transcode** 降至 2.5K (iPhone H.264 硬解上限约 4096x2304)
- H.264 ≤ 4K → **direct** (正常 MP4 直播)
- 移动端默认 `maxWidth=2560`, remux 时忽略 (stream copy 不能缩放)

**硬件加速编码** (`src/lib/transcode/hw-accel.ts`):
- 自动检测优先级: `h264_videotoolbox` (macOS) → `h264_nvenc` (NVIDIA) → `libx264` (CPU 兜底)
- 首次转码时检测, 结果缓存在 TranscodeManager 单例中
- 运行时降级: 硬件编码失败 (exit code ≠ 0) 自动重试 libx264, 设置 `retriedWithSoftware` 防止循环
- decide API 返回 `encoder` 字段 + `maxWidth` 字段, 播放器显示统一模式徽标 (Direct/Remux/HW/SW)
- 智能硬件解码: 仅对 NVDEC 支持的编码 (h264/hevc/vp9/av1/mpeg1/mpeg2) 启用 `-hwaccel cuda`, 不支持的编码 (mpeg4/divx/wmv 等) 使用 CPU 解码 + NVENC 编码, 避免无效 GPU 占用
- 分辨率自适应码率: 480p 2M / 720p 4M / 1080p 6M / 4K 12M / 5K 16M / 6K 20M / 7-8K+ 25M (maxrate), bufsize = 2x maxrate

**FFmpeg 参数** (`src/lib/transcode/ffmpeg-command.ts`):
- Remux (H.264): `-c:v copy -c:a copy -f hls -hls_time 6 -hls_list_size 0` (MPEG-TS 段)
- Remux (HEVC): `-c:v copy -tag:v hvc1 -c:a copy -f hls -hls_segment_type fmp4 -hls_time 6` (fMP4 段 + Apple 必需的 hvc1 tag)
- Transcode (NVENC + NVDEC 支持的编码): `-hwaccel cuda -hwaccel_output_format cuda -vf scale_cuda='min({maxWidth},iw)':-2 -c:v h264_nvenc -preset p4 -cq 23 -maxrate {动态} -bufsize {动态}` (全 GPU 零拷贝管线)
- Transcode (NVENC + NVDEC 不支持的编码): `-vf scale='min({maxWidth},iw)':-2 -c:v h264_nvenc -preset p4 -cq 23 -maxrate {动态} -bufsize {动态}` (CPU 解码 + GPU 编码)
- Transcode (VideoToolbox): `-vf scale='min({maxWidth},iw)':-2 -c:v h264_videotoolbox -q:v 65 -maxrate {动态} -bufsize {动态}`
- Transcode (libx264 兜底): `-threads 0 -vf scale='min({maxWidth},iw)':-2 -c:v libx264 -preset ultrafast -crf 23 -maxrate {动态} -bufsize {动态}`
- `maxWidth` 可配置, 通过 decide API 的 `maxWidth` 查询参数传入, 支持 3840/2560/1920/1280/854 (4K/2.5K/1080p/720p/480p)
- 快速输入 seek: `-ss {seconds}` 在 `-i` 之前
- **`-muxdelay 0`** (所有 HLS 输出): MPEG-TS muxer 默认给所有时间戳加 1.4s 偏移, hls.js 期望流从 0 开始 → seek 后解码错位黑屏 + 开头 `bufferAppendError`。实测加此参数后段 start_time 从 1.433s 降至 0.033s
- **转码强制 2s 关键帧**: `-force_key_frames "expr:gte(t,n_forced*2)"` — NVENC 默认 GOP ~250 帧 (30fps 下 8.3s), 段超长且 seek 粒度粗。仅转码路径; remux 的 GOP 由源决定

**TranscodeManager** (`src/lib/transcode/transcode-manager.ts`):
- globalThis 单例 (Next.js dev hot reload 安全)
- 临时文件: `os.tmpdir()/kubby-transcode/{sessionId}/`
- 15 秒清理间隔, 90 秒空闲超时 (客户端 30 秒心跳保持活跃 session)
- 异步进程管理: `stopSession()`/`seekSession()` 异步等待旧 FFmpeg 进程完全退出后再操作, 防止分辨率切换时产生重复进程
- 跨平台进程终止: Windows 使用 `TerminateProcess` (SIGTERM 不可靠); Unix 使用 SIGTERM + 2 秒 SIGKILL 兜底; 3 秒安全超时
- 进程退出时 (SIGTERM/SIGINT) 杀死所有 FFmpeg 进程 + 清理缓存目录
- FFmpeg 不可用时降级为 direct play + 警告
- 硬件编码失败时自动 fallback 到 libx264 (同一 session 内, 透明重启 FFmpeg 进程; remux/stream copy 跳过此逻辑)
- Session 保存 sourceVideoCodec/sourceVideoWidth, seek 时传递给新 FFmpeg 进程
- `waitForPlaylist` 兼容 `.ts` 和 `.m4s` 段格式

### 服务端

**直接流** (`/api/movies/[id]/stream`): HTTP Range Requests
- 请求含 `Range: bytes=0-` 时返回 206 Partial Content
- 使用 `fs.createReadStream({ start, end })` 分段读取
- 根据文件扩展名设置 Content-Type

**HLS API Routes** (`/api/stream/[sessionId]/`):
- `playlist.m3u8` — 等待 FFmpeg 生成 m3u8, 重写 segment 路径 (支持 `.ts` 和 fMP4 的 `.m4s`/`init.mp4`)
- `segment/[name]` — 校验 segment 名称 (防路径遍历), 等待+重试不存在的 segment, 支持 `.ts`/`.m4s`/`.mp4` Content-Type
- `POST` — seek 操作 (杀旧 FFmpeg, 从新位置重启)
- `PATCH` — 心跳端点, 更新 lastAccessedAt 防止空闲超时清理
- `DELETE` — 停止 session, 清理临时文件

### 客户端

`/movies/[id]/play` 页面:
- 加载时调用 decide endpoint 判断播放模式
- Direct: 设置 `video.src` (原有行为)
- HLS (H.264): 使用 HLS.js `loadSource()` + `attachMedia()`
- HLS (HEVC): 强制使用 iOS 原生 HLS 播放器 (hls.js/MSE 不支持 HEVC 解码, `bufferAddCodecError`)
- OSD 提示 "Remuxing..." / "Transcoding..."
- HLS 时间偏移跟踪: `hlsTimeOffsetRef` 追踪 FFmpeg `-ss` 起点, `getRealTime()` 返回原始视频中的真实位置
- HLS 感知 seek: `seekTo()` 优先走**客户端快速路径** — 目标在当前 session 已生成范围内 (EVENT playlist 保留所有段) 时直接设 `video.currentTime`, 零服务端往返 (实测 147–305ms); 超出范围才 POST seek API 重启 FFmpeg (200ms 防抖)。快速路径在服务端 seek 进行中 (`seekInFlightRef`/`hlsSeekingRef`) 时跳过, 因为 video 元素还挂着旧 session 的 MediaSource, seekable 范围是陈旧的
- seek 目标保留小数秒: offset/UI state/发给服务端的 `seekToSeconds` 全程不取整 (FFmpeg `-ss` 接受小数)。曾经 `Math.floor` 导致松手瞬间进度条从拖拽位置向后闪跳到整秒位置
- **Direct play 关键帧对齐 seek**: ≥4K 宽度的 direct play 源在播放开始时后台加载关键帧索引 (`GET /api/movies/[id]/keyframes`, 服务端 `keyframe-index.ts` 用 ffprobe 仅解复用扫描, ~1.7s/900MB, globalThis 缓存), `seekTo()` 二分查找把目标吸附到最近关键帧 — 避免浏览器从前一关键帧逐帧解码 (8K HEVC 6s GOP 卡 2–3s)。实测 Jibaro 8K seek 100–136ms (原 900–2500ms), 代价是落点偏差最多半个 GOP。4K 以下源保持精确 seek。有索引时 `skip()` 也走 `seekTo` 吸附。缓存键除文件路径外还记录 `mtime`+`size`, 换源 (同路径换内容) 时自动重新扫描, 避免吸附到旧文件的关键帧
- **seek 后显示保持**: 关键帧吸附落点在松手位置之前时, 进度条不回跳 — `reportTimeUpdate` (统一的 timeupdate → UI 通道) 在播放追上请求位置前保持显示松手位置, `getRealTime()` (书签/进度保存) 仍返回真实位置。保持**没有时间超时** (曾用 8s 超时, 暂停或缓冲慢时超时后进度条仍会回滑); 只在播放追上请求位置、或位置跌破吸附关键帧 (外部 seek) 时解除
- HLS 心跳: 每 30 秒 PATCH 保持 session 活跃 (服务端 90 秒空闲超时)
- HLS 初始位置: `startAt` 参数传给 decide API, FFmpeg 直接从该位置启动 (支持 `?t=` 参数和续播恢复)
- HLS 网络错误自动 seek 恢复
- HLS 进度条时长: 使用数据库 `durationSeconds` (ffprobe 扫描值) 替代不可靠的 `video.duration`
- 每 10 秒自动保存播放进度 (`PUT /api/movies/[id]/user-data`)
- 播放完成自动标记已看 + 更新播放次数
- 控制栏: 分组布局 (书签|模式|播放设置|系统), 组间 `w-px h-4 bg-white/20` 竖线分隔, 文本按钮统一 chip 样式 (`bg-white/10 rounded`, 激活态 `bg-primary/25 text-primary`)
- 控制栏分组: 书签 (快速/详细) | 模式 (360°/重置视角) | 播放 (分辨率/倍速) | 系统 (自动隐藏/音量/全屏), 低频按钮靠右
- 转码分辨率选择器: 仅在 transcode 模式显示, 支持 4K/2.5K/1080p/720p/480p, 切换时在当前位置重启 FFmpeg
- 移动端控制栏: 双行布局 (上行播放控制居中, 下行时间+功能按钮), 图标 `h-4 w-4` + chip `text-[11px]` 缩小防溢出, iOS 隐藏全屏按钮 (WebKit 不支持 Fullscreen API)

**HEVC/移动端播放踩坑记录**:
- HEVC MP4 direct play: 桌面端 (Chrome/Edge 有系统 HEVC 解码器) 可用, iOS 不可用 (range request 方式不支持)
- iOS HEVC 必须走 HLS: remux (stream copy) 到 HLS, 用原生播放器解码, 零转码开销
- Apple HLS HEVC 必须用 fMP4 段: MPEG-TS (`.ts`) 不支持 HEVC, 必须用 `-hls_segment_type fmp4` 生成 `init.mp4` + `.m4s`
- Apple 要求 `hvc1` codec tag: FFmpeg 默认 `hev1`, 必须加 `-tag:v hvc1` 否则 iOS 静默失败 (黑屏无报错)
- hls.js (MSE) 不支持 HEVC: iOS Chrome 的 `Hls.isSupported()` 返回 true 但 MSE 无法解码 HEVC → `bufferAddCodecError`, 必须绕过 hls.js 用原生 HLS
- iPhone H.264 硬解上限约 4096x2304: 5K+ H.264 视频 direct play 返回 `SRC_NOT_SUPPORTED`, 需转码降分辨率
- iPhone HEVC 硬解支持 8K (A14+): 同分辨率 HEVC 比 H.264 兼容性好得多
- remux 不能加 maxWidth: stream copy 无法缩放, FFmpeg 加 scale filter 会崩溃 (`Failed to inject frame into filter`)
- **iOS HEVC remux B-frame 解码失败**: HEVC `has_b_frames >= 2` 的视频 remux 到 HLS fMP4 后 iOS 报 `Decode:Media failed to decode`。原因是高 B-frame 数的 HEVC 在 stream copy 到 fMP4 时 composition time offset (CTS) 处理有问题, iOS 原生 HLS 播放器无法正确解码 B-frame 重排序后的段。`has_b_frames=1` 的视频不受影响 (即使 8K 54Mbps 也能正常 remux 播放)。修复: decide 时检查 `media_streams.has_b_frames`, `>= 2` 强制走 transcode 而非 remux。注意 profile/pixFmt/level 相同的视频可能因 B-frame 数不同而一个能放一个不能, 只看 profile 不够
- **NVENC fallback 竞态**: NVENC 转码 8K 视频约 30s 后崩溃 (`exit code null`), 自动 fallback 到 libx264。用户 seek 时 `seekSession()` 的 `killProcess()` 设 `session.process = null`, 但 NVENC `exit` handler 异步触发后覆盖 `session.process = fallbackProcess`, 在已删除的 outputDir 里启动 libx264 → `Failed to open file ... No such file or directory` → 级联崩溃。修复: `exit` handler 加 `if (!session.process) return;`, 如果 killProcess 已 null 化则不 spawn fallback
- **多碟 session 泄漏**: 前端 seek 时调新 `decide` 而非 `seekSession`, 旧 session 不被清理。同一电影多个 FFmpeg 并发竞争资源。修复: `startSession()` 开头遍历并 SIGKILL 同 `movieId` 的所有旧 session
- **多碟 media_streams 字段遗漏**: scanner 有两处 `media_streams` 插入 (disc 1 和 disc 2+), 新增字段 `pixFmt`/`level`/`hasBFrames` 只加到了 disc 1 的插入。CD2 的 `hasBFrames` 为 null → B-frame 检查不触发 → 错误走 remux。教训: schema 加字段时必须检查所有 insert 点, 不仅是 `replace_all` 匹配到的
- **fetch 缺 r.ok 检查**: API 返回 `{ error: "..." }` (401/500) 时, React Query 的 `queryFn` 直接 `.json()` 不检查 status, 将 error 对象当作 data 存储。后续 `.filter()` 在非数组上调用崩溃 (`eP?.filter is not a function`)。`?.` 不帮忙因为值不是 undefined 而是对象。修复: 所有 queryFn 加 `if (!r.ok) throw new Error()`
- **hls.js seek 404**: seek 时旧 hls.js 实例在 fetch 返回前仍在轮询已销毁 session 的 playlist → 404。修复: fetch 前调 `oldHls.stopLoad()` 停止轮询
- **MPEG-TS muxdelay 1.4s 偏移**: FFmpeg TS muxer 默认 muxdelay 0.7 实际产生 1.4s 时间戳偏移, remux/转码段 start_time=1.433s 而 hls.js 按 0 对齐 → seek 后黑屏 (BUG-7) + 开头 bufferAppendError (BUG-5)。修复: 所有 HLS 输出加 `-muxdelay 0`
- **rm/rmvb demuxer seek 不可靠**: RealMedia 容器 input-side 或 output-side `-ss` 都可能落到损坏数据, rv40 解码器无法恢复 (`Error submitting packet to decoder` → 0 帧输出)。从头播放正常; rmvb seek 属 best-effort, 无代码层修复
- **DB schema 迁移二步**: 改 schema 必须同时改 `src/lib/db/schema.ts` 和 `src/lib/db/index.ts` 的 migration 数组 (`ALTER TABLE ... ADD`), 否则已有数据库报 `no such column`
- DB 路径可移植性: `people.photoPath` 存相对路径 (`metadata/people/...`), 运行时用 `resolveDataPath()` 拼绝对路径, 迁移数据目录后无需重新刮削
- 书签系统: B 键快速书签 (使用模板预设), Shift+B 详细书签 (选图标/标签/备注)
- 进度条书签标记: 彩色圆点 + 图标, hover 放大, 点击定位; 支持低调模式 (半透明白色)
- 3 秒无操作自动隐藏控制栏 (可通过 toggle 按钮关闭自动隐藏)
- **移动端双击快进快退**: YouTube 风格, 双击左半屏快退、右半屏快进。单击延迟 300ms 以区分双击, 然后切换播放。桌面端不受影响 (单击立即切换)
- **可调快进快退秒数**: 移动端右侧面板 Timer 按钮打开中央 Dialog, 滑块调节 1–60s (默认 10s), 同时影响移动端双击和桌面端 skip 按钮

### 360° 全景播放

播放器内置 360° 全景模式, 用户通过控制栏 `360°` 按钮手动开关, 状态跟用户走 (`user_preferences.player_360_mode`)。

**渲染架构** (全部在客户端浏览器执行, Server 仅提供视频流):
```
<video> (hidden, HLS/直连解码) → VideoTexture → SphereGeometry (BackSide) → WebGLRenderer
                                                       ↑ camera at origin
                                                       ↑ Pointer drag → lon/lat → lookAt
```

**组件**: `panorama-360-player.tsx` — Three.js 动态导入 (`ssr: false`), 代码分离为独立 chunk (~500KB), 仅 360 模式激活时加载。

**VR 立体布局** (`layout` prop): `mono` (单画面 equirect) / `ou` (over-under 上下排布, 左眼在上) / `sbs` (side-by-side 左右排布, 左眼在左)。通过球体 UV 重映射只采样左眼半幅 (VideoTexture Y 翻转, ou 取 v∈[0.5,1])。控制栏 360° 开启时显示布局选择器 (桌面 chip 菜单 / 移动端中央弹层), 选择按电影持久化到 `user_movie_data.vr_layout` (migration #0032), 播放页从 `userData.vrLayout` 初始化。

**交互**:
- 鼠标/触摸拖拽旋转视角 (Pointer Events, lon/lat 球面坐标)
- 滚轮缩放 FOV (30°–120°)
- 双指 pinch-to-zoom (移动端 FOV 缩放)
- `R` 键 / ↺ 按钮重置视角到正前方 + FOV 75°
- 拖拽 vs 点击检测 (拖拽不触发播放/暂停)

**性能优化**:
- 视频暂停时停止 `requestAnimationFrame` 循环, 拖拽/缩放按需渲染单帧
- `pixelRatio` 上限 2, 移动端可降至 1
- 球体精度 60×40 段, 移动端可降至 32×24

**书签集成**:
- 360° 模式下书签缩略图截取当前视角画面 (WebGL `preserveDrawingBuffer` + `toBlob`)
- 书签保存相机视角 `view_state` JSON (`{lon, lat, fov}`)
- 从 BookmarkCard 导航时 URL 携带 `&vs=lon,lat,fov`, 自动开启 360° 模式并恢复视角
- 进度条书签标记点击也恢复视角

---

## 人物照片墙

### 概览

人物详情页 (`/people/[id]`) 在 Filmography 下方展示照片墙, 支持多图上传、Lightbox 浏览和删除。

### 布局方案: Justified Row (Google Photos 风格)

每行图片等高但宽度不同, 行两端对齐。每张图保持原始宽高比, 不裁切。

**算法流程:**
1. 客户端预加载所有图片获取原始尺寸 (`new Image()` + `onload`)
2. `ResizeObserver` 监听容器宽度 (通过 callback ref 绑定, 避免条件渲染时序问题)
3. 贪心行分配: 以目标行高 280px 计算每张图缩放后宽度, 累加直到超过容器宽度
4. 行满时: 计算实际行高 = `(容器宽 - 总间距) / 总宽高比之和`, 所有图缩放到该行高
5. 末行: 行高上限为目标行高, 避免图片过少时拉伸变形

### Gallery API

| 方法 | 说明 |
|------|------|
| `GET /api/people/[id]/gallery` | 列出 `{personDir}/gallery/` 下的图片, 返回 `{ images: [{ filename, path }] }` |
| `POST /api/people/[id]/gallery` | FormData 多文件上传, 自动编号 (`001.jpg`, `002.png`), 创建 `gallery/` 目录 |
| `DELETE /api/people/[id]/gallery` | Body `{ filename }` 删除单张, 校验路径遍历攻击 |

人物目录推导: 优先从 DB `photoPath` 取父目录, 否则由 `sanitizePersonName()` + 首字母计算。

### 前端交互

- **缩略图网格**: Justified 行布局, hover 时缩放 + 右上角出现删除 X 按钮
- **Lightbox**: 全屏暗色遮罩 (`bg-black/90`), 居中显示原始比例大图, 左右箭头翻页, 键盘 Escape/方向键支持
- **上传**: 隐藏 `<input type="file" multiple>` 触发, 成功后刷新 gallery 查询
- **删除**: 点击 X 弹出确认对话框, 确认后调用 DELETE API

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
| `/` | 首页 | 「Now Showing」Hero: Netflix 式动态海报马赛克墙 (`home/hero-mosaic.tsx`: 随机采样 60 部 `sort=random`, 16 列 perspective/rotateX24°/rotateZ-16° 倾斜, 每列独立速度无缝 translateY 循环; **每部电影按「自身 poster→自身 fanart」成对入列**——漂移时 poster 紧跟它自己的横版剧照, 不再是 A 的 poster 配 B 的 fanart, 单图电影只出一张; poster+fanart 对不跨列间隙拆开) + 聚光灯同步 (每 8s 随机点亮**偏右 ~5 列**可见区一部电影, **poster 与其对应 fanart 同时点亮**——`litTiles` Set + `tilePairs` 映射; 最左 2 列/最右 2 列因倾斜边缘透视差不入选, 眼睛落点更清晰; 逐卡遮罩淡出+光晕+ring 增亮, onFeature 上报 → 文字块/按钮/环境光底色跟随; <8 部时回退单剧照+轮播指示条) + 白底黑字播放按钮 + Ambilight 环境光场(`home/ambient-field.tsx` + `lib/ambient-color.ts`: posterBlur 取色, 悬停海报光场指数平滑变色 τ≈600ms, 9s 呼吸, reduced-motion 静态; 电影/继续观看/媒体库卡片 hover 均有光晕) + 悬浮玻璃药丸 Tab: Home (媒体库+继续观看+最近添加+收藏ScrollRow) / Favorites (全局收藏网格) |
| `/movies?libraryId=X` | 媒体库浏览 | 需 libraryId, 3 Tab: Movies (排序下拉+网格) / Favorites (库内收藏网格) / Genres (按类型分组ScrollRow) |
| `/movies/[id]` | 电影详情 | Jellyfin 风格: fanart 充分可见(仅底部渐变) + 左侧海报(300×450) + 右侧 text-shadow 信息面板(标题/元数据行/小型按钮行/Overview/Metadata 纵向列表) + 帧浏览书签模式(BookmarkPlus按钮, FrameScrubber两栏面板: 帧预览+进度条覆盖层/书签表单+截图到演员相册) + 书签 ScrollRow + 演员卡片 + 推荐 |
| `/movies/[id]/play` | 播放器 | 全屏 + 自动保存进度 + 书签 (B/Shift+B) + 倍速 + 进度条图标标记 + 自动隐藏控制栏 (可 toggle) + 360° 全景模式 |
| `/people/[id]` | 演员详情 | fanart 渐变 + 大卡片 + 参演作品网格 + 照片墙(Justified 行布局+Lightbox+上传/删除) |
| `/search` | 搜索 | 搜索框 + 电影结果 + 演员结果 + 书签剪辑 (按宽高比分横屏/竖屏行) |
| `/profile` | 个人资料 | 头像/用户名/密码/账户类型 |
| `/preferences/hero-mosaic` | 首页海报墙 | 滚动方向(纵向列/横向行)/列数(8–24, 横向映射为 4–12 行)/风格(仅海报/仅剧照/海报+剧照)/角度(5 档 transform 预设)/媒体库占比(默认按库大小比例, 可自定义加权, 0=排除)/年份范围/最低分辨率; 顶部实时预览(真实 HeroMosaic 组件, 数据项变化才重新抽样, 方向/列数/角度纯重渲染); `/preferences` 默认落此页 |
| `/preferences/card-badges` | 卡片标记 | 电影卡片(分辨率/评分)和演员卡片(段位)徽章开关, 预览卡片, 可展开规则说明 |
| `/preferences/ratings-bookmarks` | 评分与书签 | 多维度评分维度管理(重命名/排序/权重/删除确认), 书签图标管理(内置9个+自定义上传), 快速书签模板 |
| `/preferences/playback` | 播放设置 | 外部播放器选择 (IINA/PotPlayer/Web Player), 本地/串流模式 |
| `/preferences/language` | 语言设置 | en/zh 切换 |
| `/dashboard` | 系统概览 | 4 个统计卡片 + 活动列表 + 快速操作 (System 子导航) |
| `/dashboard/libraries` | 媒体库管理 | 库卡片 + Dialog(含FolderPicker+刮削开关) + 扫描/删除 (独立页面) |
| `/dashboard/scraper` | 刮削器设置 | TMDB API key 管理 (输入/验证/掩码显示) (System 子导航) |
| `/dashboard/users` | 用户管理 | 完整 CRUD: 添加用户 / 删除 / 角色切换 / 重置密码, 末位管理员保护, 自删除防护 (独立页面) |
| `/dashboard/networking` | 网络设置 | 端口配置, Docker 模式检测, 重启提示 (System 子导航) |

### 共享组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `AppHeader` | `components/layout/` | 顶部导航: logo + 搜索图标 + 用户头像(→/profile) |
| `NavSidebar` | `components/layout/` | 汉堡菜单侧边栏: Home / MEDIA(All Movies) / ADMIN(Libraries+Users+System, 仅管理员) / USER(Preferences+Profile+Sign Out) |
| `AdminSidebar` | `components/layout/` | 系统管理子导航: Overview/Scraper/Networking, 渐变高亮+圆角指示器 |
| `PreferencesSidebar` | `components/layout/` | 偏好设置子导航: Card Badges/Ratings & Bookmarks/Playback/Language |
| `GlassToast` | `components/ui/` | 玻璃风格 Toast 通知: `bg-[#0a0a0f]/70 backdrop-blur-2xl`, 居中底部/顶部, success=primary icon / error=red icon, `aria-live="polite"` |
| `AddLibraryCard` | `components/library/` | 空状态媒体库卡片 (虚线边框), 点击打开内联添加媒体库 Dialog |
| `MovieCard` | `components/movie/` | 海报卡片 (180x270), 支持评分/收藏/进度条, hover 显示 watched/favorite 切换 + ⋯ 下拉菜单 (Play/Edit/MediaInfo/Delete) |
| `PersonCard` | `components/people/` | 演员卡片 (sm:140x210, md:160x240, lg:240x340) |
| `BookmarkCard` | `components/movie/` | 书签缩略图卡片 (按实际缩略图宽高比分横屏/竖屏两行 ScrollRow, 支持编辑/删除/图标选择, 过滤禁用图标) |
| `FrameScrubber` | `components/movie/` | 帧浏览器面板 (左右两栏: 帧预览+覆盖层控件/书签表单, 进度条300ms拖拽防抖, 书签图标标记, 磨砂玻璃按钮+闪光动效, 截图到演员相册, 演员下拉选择器, 时间戳跳转, 多碟支持) |
| `LibraryCard` | `components/library/` | 媒体库卡片 (360x200), 未扫描 overlay+扫描按钮, 扫描进度含标题, 跳过计数, hover ⋯ 菜单 |
| `GlobalScanBar` | `components/layout/` | 底部全局扫描条, 显示当前标题+进度, 完成后可展开跳过列表 |
| `FolderPicker` | `components/library/` | 服务端目录浏览器 Dialog |

---

## 主题配色

定义在 `globals.css` 的 `:root` 中, 始终深色模式。Cinema Indigo + Gold 配色。

| CSS 变量 | 色值 | 用途 |
|----------|------|------|
| `--background` | `#0a0a0f` | 页面背景 |
| `--foreground` | `#f0f0f5` | 主要文字 |
| `--surface` / `--card` | `#1a1a2e` | 卡片/表面 |
| `--header` / `--muted` | `#111118` | 导航栏/侧边栏 |
| `--primary` | `#6366f1` | 主强调色 (靛紫) |
| `--secondary` | `#818cf8` | 次强调色 (浅靛紫) |
| `--muted-foreground` | `#8888a0` | 次要文字 |
| `--gold` | `#ca8a04` | 评分/高亮 (暖金) |
| `--destructive` | `#ef4444` | 危险操作 |
| `--border` | `rgba(255,255,255,0.06)` | 边框 |
| `--radius` | `0.5rem` (8px) | 基础圆角 |

字体: Inter (通过 `next/font/google` 加载), CJK 回退: PingFang SC → Microsoft YaHei → Noto Sans SC

### Fluid Glass 设计体系

全局采用毛玻璃 (glassmorphism) 风格, 通过 `globals.css` 中的工具类实现:

| 工具类 | 用途 | 效果 |
|--------|------|------|
| `.glass-cinema` | 信息面板 (登录/设置等) | `bg rgba(10,10,15,0.75)` + `blur(28px) saturate(1.3)` + inset highlight |
| `.glass-badge` | 小标签/徽章 | `bg rgba(255,255,255,0.08)` + `blur(12px)` |
| `.glass-btn` | 图标按钮 | `bg rgba(255,255,255,0.06)` + `blur(12px)` + hover 发光 |
| `.glass-card` | 内容卡片 | `bg rgba(255,255,255,0.04)` + `blur(16px)` + hover 阴影 |
| `.transition-fluid` | 弹性动画 | `cubic-bezier(0.22,1,0.36,1)` 280ms, 含 scale/translate |
| `.tilt-lift` | 3D 视差抬升 | `translateZ(var(--tilt-lift, 28px))`, 用于 TiltCard preserve-3d 子树内的徽章/按钮 |

### 3D 深度卡片 (TiltCard) — UI 现代化 Phase 1

`components/ui/tilt-card.tsx` — 可复用的 Apple-TV 式指针倾斜原语，已接入
MovieCard / PersonCard / ContinueWatchingCard / LibraryCard：

- **倾斜**: perspective 900px 容器 + preserve-3d 内层，指针跟随 rotateX/rotateY ≤6°;
  pointermove 只更新 target，自终止 rAF 循环以指数平滑趋近
  (`k = 1 - exp(-dt/90ms)`，帧率无关) 后直接改 ref 的 `style.transform`
  （零 React 重渲染）。快速入场从静止缓动到目标角度而非单帧跳变；
  pointerleave 同一循环回落到 0（无 CSS transition，避免中途被杀导致跳变）。
  `use-hero-parallax.ts` 的指针漂移同套平滑；滚动视差保持 1:1 即时（滚动
  联动的运动不能滞后）。
- **光泽**: radial-gradient 高光层跟随光标 (`--glare-x/--glare-y`)，hover 淡入。
- **视差**: 子元素加 `.tilt-lift` 类以 translateZ 浮起（徽章 22px、播放按钮 40px）。
- **环境光晕**: MovieCard/PersonCard 用已有 `posterBlur`/`photoBlur` 在卡片背后渲染
  blur(24px)+saturate 光晕，hover 淡入 (opacity 0.55)。该字段必须在每个 API select
  与卡片调用点显式传递（search API/猜你喜欢/影人作品格曾漏传 → 无光晕）。
- **Pitfall: 横向滚动 row 截断光晕** —— CSS 规定 `overflow-x: auto` 会把计算后的
  `overflow-y` 也强制为 auto，光晕与 hover 放大在滚动容器边缘被裁。解法（净布局
  不变，均 md+）：纵向 padding 补偿 `md:-my-20 md:py-20`（80px，超过 blur(24px)
  的可见衰减尾巴，40px 不够会残留裁剪线）；横向受页面留白限制只有 40px
  （`md:-mx-10 md:px-10` + `md:scroll-px-10` 保 snap），配
  `mask-image: linear-gradient(to right, transparent, black 40px, …)` 让光晕在
  row 两端渐隐而非硬裁。放大的透明盒要 `md:pointer-events-none` +
  `md:[&>*]:pointer-events-auto` 防抢点击；标题行 `relative z-10`。
  见 `scroll-row.tsx` 与详情页 discs row。缩小光晕本身被用户否决。
- **降级**: 触屏 (`pointer: coarse`) 与 `prefers-reduced-motion: reduce` 下完全禁用，
  行为与旧版一致；`disabled` prop 在下拉菜单打开时冻结回平面。
- **Pitfall**: `preserve-3d` 会破坏 Chromium 下子孙元素的 `backdrop-filter` ——
  卡片的毛玻璃 hover 操作条/进度条必须放在 TiltCard 子树**外**（作为兄弟绝对定位）。

### View Transitions 海报飞入 (card → detail)

`lib/view-transition.ts` — 零依赖 shared-element 过渡：点击电影卡片，海报原位
放大变形为详情页 350×525 大海报。

- **机制**: 点击时给被点海报内联 `view-transition-name: movie-poster`（避免同片
  多行出现导致重名跳过），详情页大海报静态携带同名 + `data-vt-poster` 标记；
  `document.startViewTransition` 的回调 `navigate + MutationObserver 等待目标挂载`
  后 resolve，浏览器再捕获新快照。旧页面若有残留命名元素（详情页推荐行→详情页）
  会先摘除。
- **Pitfall**: startViewTransition 回调 pending 期间**渲染被冻结，rAF 不会 tick**——
  在回调里等 requestAnimationFrame 会死锁到 Chrome ~4s 超时中止
  ("Transition was aborted because of timeout in DOM update")。用 timer/微任务
  (`img.decode()`) 等待，不要用 rAF。
- **降级**: Firefox 等无 API 浏览器、`prefers-reduced-motion`、移动端（详情页海报
  `hidden md:block` 无目标）都直接普通导航。动画曲线/时长在 globals.css 的
  `::view-transition-*(movie-poster)` 规则中（420ms fluid 曲线）。

### 详情页深度舞台 (Phase 2)

- **视差**: `hooks/use-hero-parallax.ts` — 滚动时 fanart 以 0.35× scrollTop 下沉,
  指针在 hero 上移动时 fanart 反向漂移 ±10px、海报同向 ±5px(rAF 节流、ref 直写,
  零重渲染)。仅桌面(fine pointer + md+ + 非减动效);fanartMode 时挂起。
  `ready` 参数在 `movie` 数据到达、hero DOM 真实挂载后重绑监听(页面有 loading
  early-return,首次 mount 时 ref 全空)。**约束**: 视差 transform 只写在 fanart
  图层与海报包裹层上——玻璃信息面板的祖先链上不能有 transform(见上方 Pitfall)。
- **海报**: 大海报接入 TiltCard(maxTilt 4)+ 常亮环境光晕;`data-vt-poster`
  元素保持不变,View Transition 飞入不受影响。
- **放映机光锥(已移除)**: `projector-beam.tsx` 曾在 hero 上叠加 WebGL 光束/
  尘埃/胶片颗粒,用户体验后否决("没什么用也不好看"),2026-07-04 删除。留下的
  经验(透明 WebGL 覆盖层画"光"必须预乘 alpha 合成 + 压暗光外区域制造对比,
  three 的 `AdditiveBlending` 会把预乘输出的强度平方级衰减)记录在
  `docs/feature-completed.md` 2026-07-04 (5)。

### WebGL 海报墙 — Cover Flow (Phase 3, v2 重做)

`components/movie/poster-wall.tsx` — movies 页「海报墙」按钮(仅 WebGL2 + md+ +
非减动效时显示)进入全屏「唱片架」Cover Flow(v1 平面弧形网格被用户否决,已重写):

- **布局**: 焦点海报正面朝屏、放大 1.35×、前凸 z=2.2;两侧海报如唱片竖插堆叠
  (rotY ∓1.05rad,x = 2.1 + (|d|−1)·0.62)。所有 transform 纯由
  `d = index − focusFloat` 连续推导,0<|d|<1 区间两种姿态 lerp,滑动全程连续。
- **动效**: 每帧向目标姿态指数平滑 (`k = 1−exp(−dt/120ms)`,同 TiltCard 套路),
  循环稳定后自停。排序切换 = 改每项 index → 目标位移 → 全场海报飞行重排(免费)。
  reduced-motion 时 k=1 直接落位。
- **元数据整合**: 顶部玻璃排序 pills(标题/社区评分/个人评分/添加时间/年份/时长/
  分辨率/文件大小,同 movies 页,点激活 pill 翻转升降序);排序在墙内客户端完成。
  按维度自动插入 3D 分组分隔卡(年代/分辨率档 4K~SD/评分带/体积带,canvas 纹理,
  可聚焦不可点进);缺元数据的归入尾部「—」组,null 恒排最后。底部字幕式 caption
  (HTML,仅整数焦点变化时 setState):无盒,全宽底部渐变(`from-[#06060a]` 与
  背景板同色,顺带压住倒影)上浮标题 + 间隔点分隔的
  `年份·分辨率chip·编码·体积·时长·★评分`;焦点切换用 `key` 重挂载触发
  280ms 淡入上浮(`animate-caption-rise`)。曾用不透明黑盒被用户否决("不优雅")。
- **观感**: 每张海报有镜面倒影(scale.y=−1 共享纹理,共享渐变 alphaMap 下淡出,
  电影 0.28/分隔卡 0.14),渐变背景板;纹理 480w + mipmap +
  各向异性过滤(min(8, maxAniso))——v1 的 LinearFilter 无 mipmap 在侧视角闪烁,
  是"简陋感"主因之一。
- **交互**: 滚轮一格一张(累积阈值,触控板友好)、拖拽连续搓动(120px/张,
  松手带速度甩动 ±6 张封顶)、点侧面聚焦、点焦点海报/Enter 进详情、
  ←/→/PageUp/PageDown/Home/End 键盘导航、ESC/X 退出。
  setPointerCapture/release 需 try/catch(pointer 已消失时会抛 NotFoundError)。
- **数据加载(独立渐进式,无上限)**: 海报墙**不再复用 movies 网格已滚动加载的
  数组**(旧逻辑:网格加载完则复用、否则单发 `limit=500`,内容取决于滚动进度且
  封顶 500——已废弃)。改为 movies 页 `openPosterWall` 自持一个 `useRef` load
  token,按当前筛选条件分页 `offset`/`limit=200` 循环拉取,每页到达即
  `setWallMovies([...acc])` 增量喂给墙;`closePosterWall`/重开会 bump token 让
  在途循环静默中止。API(`/api/movies`)标准列表路径:仅当同时带 `offset` **且**
  显式 `limit` 时才按该 limit 分页(clamp 1..500/页),否则维持 50/页——网格不带
  `limit` 故不受影响。整库(>500)完整加载。
- **键控 reconciliation(增量不重下、不闪)**: 渲染器/scene/闭包只在挂载时建一次
  (effect 依赖 `[isEmpty]`,**绝不**随 `movies` 增长重跑,否则整机重建 + 重下所有
  纹理);`movies` 引用变化经**独立** `[movies]` effect → `rebuildRef` 触发。
  `buildTiles(flow)` 按 `movie.id` 复用既有 tile:命中则保留其 mesh/材质/纹理/
  `cur` 姿态仅刷新 `item`(不 dispose、不重下、不弹跳),仅 `isNew` 新 tile 入场
  并从 `scale×0.9` 缓入;分隔卡(合成 key)与消失的电影一律 `disposeTile` 全量
  释放(材质 + 倒影材质 + 纹理 + sepTexture,无泄漏)。焦点按 movie.id 锚定,
  跨追加/重排保持。排序 pill 与渐进追加共用这一条 `rebuild` 路径。
- **纹理 LRU**: 并发 6、按距焦点优先级流式加载;仅保留焦点 ±60 窗口内纹理,
  硬上限 140,驱逐时 dispose 并回退占位色 —— 显存与库大小解耦,数千部亦可控。
  大 N 热点已消除:`pump` 按索引迭代(去掉 `tiles.indexOf` 的 O(n²));hover
  raycast 仅测焦点 ±40 窗口内 tile(窗外不可见/不可交互)。
- **视口适配**: 组件用 `createPortal(…, document.body)` 渲染——movies 网格的
  入场动画会在祖先上留下 `transform`,使 `position: fixed` 退化为相对该盒子
  定位(墙缩成网格大小,**Pitfall**)。相机由 `refit()`(初始 + resize)求解:
  顶部预留 96px(排序 pills)、底部 150px(HUD),焦点海报恰好填满剩余带高
  (`camZ = FOCUS_Z + visH/(2·tan(fov/2))` + y 偏移居中)。
- **导航**: 点击/Enter 进详情时**不**先 onClose——墙保持挂载直到路由切换卸载
  movies 页,否则网格会闪现一帧。ESC/X 才调 onClose。
- Three.js 独立 chunk(dynamic import)不变;平面网格仍为默认视图。

**圆角层级**: 输入框 `rounded-md` (6px) → 按钮 `rounded-lg` (8px) → 卡片容器 `rounded-xl` (12px)

> **Pitfall: `backdrop-filter` 与 CSS class 优先级冲突**
>
> Movie/Person detail 页面的 glass panel 直接使用 Tailwind utility (`backdrop-blur-[20px]`) 而非 `.glass-cinema` CSS class。原因：`.glass-cinema` 的 `backdrop-filter` 在该上下文中不生效（疑似 Tailwind v4 与自定义 CSS class 的优先级/层叠冲突），而相同属性通过 Tailwind utility class 内联则正常工作。
>
> **规则**：在需要 `backdrop-filter` 生效的场景，优先使用 Tailwind utility（`backdrop-blur-*`）而非自定义 CSS class。`.glass-cinema` 仍可用于不依赖 backdrop-filter 的场景（登录、设置向导等，背景不透明度足够高）。
>
> **相关限制**：`backdrop-filter` 无法穿透父元素创建的 stacking context（`transform`、`animation` with `fill-mode: both`、`opacity < 1`、`will-change` 等）。Detail 页面的 content-row 因此不使用 `animate-fade-in-up`。

**交互规范**: 所有可点击元素 `cursor-pointer`, 主按钮 `active:scale-95`, 错误消息 `role="alert"`, 图标按钮 `aria-label`

---

## 配置文件

### next.config.ts
```typescript
// 使用 createNextIntlPlugin 包裹, 指向 src/i18n/request.ts
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl({
  output: "standalone",                          // 产出可独立运行的 server bundle
  reactCompiler: true,
  images: { unoptimized: true },                 // 本地图片走 API 不需要 Next.js 优化
  serverExternalPackages: ["better-sqlite3", "sharp"], // 避免 Webpack 打包原生模块
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
| `person` | 人物详情 (出生/逝世/出生地/照片墙) |
| `personalMetadata` | 个人元数据设置 |
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
Step 3: 添加媒体库 (name / folderPath + FolderPicker) — 可 Skip, 有路径时强制要求填库名
Step 4: POST /api/setup/complete → 显示完成 → 跳转 /login (不再自动扫描, 用户在首页手动触发)
```

---

## 移动端响应式适配

### 策略

Mobile-first CSS — 无前缀写手机样式, `md:` 前缀写桌面样式。统一断点 768px (`md:`)。

### 新增组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `BottomTabs` | `components/layout/` | 移动端底部 Tab 栏 (Home/Movies/Search/Settings), `md:hidden`, 播放页自动隐藏 |
| `useIsMobile` | `hooks/use-mobile.ts` | `window.matchMedia("(max-width: 767px)")` 响应式 hook |

### 页面适配清单

| 页面 | 适配方式 |
|------|---------|
| **Login / Register** | `w-[480px]` → `w-full max-w-[480px] mx-4 md:mx-0`, 内边距缩小 |
| **Home** | `px-12` → `px-4 md:px-12`, `gap-10` → `gap-6 md:gap-10`, Favorites 网格 `grid-cols-2` |
| **Search** | 搜索框 `w-[800px]` → `w-full max-w-[800px]`, Category chips `flex-wrap` |
| **Profile / Preferences** | `w-[720px]` → `w-full max-w-[720px]`, 容器 `px-4 md:px-0`; Preferences 带 PreferencesSidebar 子导航 |
| **Movie Detail** | Hero: 手机端 fanart banner (`h-[220px]`) + 隐藏 poster + 流式布局; 桌面保持 absolute 叠加; Play 按钮 `w-full md:w-auto`; 所有 section `px-4 md:px-20`; View fanart / Bookmark mode 按钮手机端隐藏 |
| **Person Detail** | 与 Movie Detail 同构: fanart banner + 隐藏 poster + 响应式标题/padding |
| **Movies Browse** | `px-12` → `px-4 md:px-12`, 电影网格 `grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)]`, MovieCard 传 `responsive` prop |
| **Dashboard (System)** | AdminSidebar `hidden md:flex` + 移动端水平滚动导航条; `(system)` route group 布局 `flex-col md:flex-row`; Libraries/Users 独立页面无子导航 |

### 组件适配

| 组件 | 适配方式 |
|------|---------|
| **AppHeader** | `px-8` → `px-3 md:px-8` |
| **ScrollRow** | Chevron 按钮 `hidden md:flex`; 添加 `snap-x snap-mandatory md:snap-none` 触控滑动 |
| **MovieCard** | 新增 `responsive` prop: `w-full` + `aspect-[2/3]` 替代固定 180×270, 用于网格布局 |
| **BookmarkCard** | `w-[320px]` → `w-[280px] md:w-[320px]` |
| **Dialog** (MetadataEditor / ImageEditor) | 手机端全屏: `max-h-[100dvh] rounded-none md:rounded-lg`; 桌面端 800px; Images tab 移动端纵向堆叠 (poster w-1/2 + fanart w-full aspect-video) |
| **Main Layout** | `<main>` 添加 `pb-14 md:pb-0` 为底部 Tab 栏预留空间 |

---

## 已知限制与扩展预留

### 当前限制
- 仅支持 `movie` 类型媒体库 (schema 已预留其他类型)
- ~~视频直接播放, 无转码~~ 已支持 HLS 转码 (FFmpeg on-demand remux/transcode, HLS.js 播放)
- 搜索仅支持标题模糊匹配, 无全文搜索
- 无字幕支持
- ~~无远程元数据抓取~~ 已支持 TMDB 刮削器 (可选, 按媒体库启用, 自动生成 NFO + 下载海报/背景图)
- Dashboard 活动日志为占位实现
- i18n 覆盖 auth/setup/profile/preferences/home/movies/nav/dashboard 页面, 包括 Tab 导航标签 + 卡片 hover 操作菜单文案

### 打包分发

Kubby 支持构建为可分发的桌面应用:

```
dist/kubby-{platform}/
├── kubby(.exe)              # Go 启动器 (~9MB)
├── node/                    # Node.js 25 运行时
├── bin/                     # ffprobe 静态编译
└── server/                  # Next.js standalone 输出
    ├── server.js
    ├── package.json
    ├── node_modules/        # 最小化依赖 (含 better-sqlite3, sharp)
    ├── .next/               # 编译产物
    └── public/              # 静态资源
```

**启动流程**: Go 启动器 → 读取 config.json → 解析数据目录 → 自动生成 AUTH_SECRET → 启动 Node.js 子进程 → 等待就绪 → 打开浏览器 → 系统托盘

**数据目录解析链** (`launcher/main.go`):
1. 环境变量 `KUBBY_DATA_DIR` (最高优先级)
2. `config.json` 中的 `dataDir` 字段
3. OS 默认位置: Windows `%LOCALAPPDATA%\Kubby` / macOS `~/Library/Application Support/Kubby` / Linux `~/.local/share/kubby`

**Windows 安装器数据目录** (`installer/windows/kubby.nsi`):
- 安装时提供 "Data Directory" 自定义页面, 默认 `%LOCALAPPDATA%\Kubby`
- 升级时从注册表 `HKLM\Software\Kubby\DataDir` 读取上次选择并预填
- 选择新位置时自动迁移旧数据 (db/secret.key/metadata), 逐文件验证后才删除旧文件
- 迁移失败自动回退默认位置, config.json 已存在时保留用户端口设置
- `SetShellVarContext current` 确保 UAC 提升后路径仍解析到当前用户
- 升级前清理旧程序目录 (node/bin/server), 防止残留文件

**关键配置**:
- `KUBBY_DATA_DIR` — 数据目录路径 (默认 `process.cwd()/data`)
- `FFPROBE_PATH` — ffprobe 二进制路径 (默认 PATH 中的 `ffprobe`)
- `FFMPEG_PATH` — ffmpeg 二进制路径 (默认 PATH 中的 `ffmpeg`, 用于 HLS 转码)
- 路径管理集中在 `src/lib/paths.ts`
- 日志轮转: `src/lib/log-rotation.ts` — 启动时检查 `kubby.log` 大小, 超过 10MB 自动归档为 `kubby.log.1` (最多保留 3 个), 防止日志无限增长

**构建命令**: `npx tsx scripts/package.ts [--platform darwin-arm64|win-x64|linux-x64]`

### 预留扩展点
- `media_libraries.type` enum 已包含 tvshow/music/book/photo
- `movies.tmdb_id` / `imdb_id` 预留远程元数据
- ~~视频流 API 可插入 TranscodeManager 中间层~~ 已实现 (HLS 转码)
- Scanner 可扩展为检测 .srt/.ass/.vtt 字幕文件
- 可加 chokidar 实现文件系统监听自动扫描
- i18n 可扩展更多语言 (在 `config.ts` 增加 locale + 添加对应 JSON)

---

## 常用命令

```bash
npm run dev              # 启动开发服务器 (http://localhost:8665)
npm run build            # 生产构建 (standalone 输出到 .next/standalone/)
npx drizzle-kit generate # 生成迁移文件
npx drizzle-kit push     # 推送 schema 到数据库
npx drizzle-kit studio   # 打开 Drizzle Studio (数据库 GUI)
TMDB_API_KEY=xxx npx tsx scripts/enrich-nfo.ts <媒体库路径>  # 从 TMDb 补充演员数据到 NFO

# 打包分发
npx tsx scripts/package.ts                       # 打包当前平台
npx tsx scripts/package.ts --platform win-x64    # 交叉打包 Windows
npx tsx scripts/package.ts --skip-download       # 跳过下载 (使用缓存或系统 ffprobe)

# Go 启动器开发
cd launcher && go build -o kubby . && ./kubby    # 构建并运行启动器
```
