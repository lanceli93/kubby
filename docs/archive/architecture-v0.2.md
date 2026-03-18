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
│   │   │   ├── page.tsx                            # 首页 (Tabs: Home=媒体库/继续观看/最近添加/收藏, Favorites=收藏网格)
│   │   │   ├── movies/
│   │   │   │   ├── page.tsx                        # 媒体库浏览 (Tabs: Movies=网格+排序, Favorites=收藏网格, Genres=按类型ScrollRow)
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx                    # 电影详情 (fanart+poster+元数据+书签+演员+推荐)
│   │   │   │       └── play/page.tsx               # 视频播放器编排 (hook 接线, 键盘快捷键, 数据获取)
│   │   │   ├── people/[id]/page.tsx                # 演员详情 (fanart+大卡片+参演作品)
│   │   │   ├── search/page.tsx                     # 搜索结果 (电影+演员)
│   │   │   ├── settings/page.tsx                   # 用户设置 (个人资料/密码/语言切换/账户信息, i18n)
│   │   │   ├── personal-metadata/page.tsx          # 个人元数据设置 (评分维度/书签图标管理/快速书签模板/低调标记)
│   │   │   └── dashboard/                          # 管理后台 (需 admin 权限)
│   │   │       ├── layout.tsx                      # AdminSidebar 布局
│   │   │       ├── page.tsx                        # 管理概览 (统计+活动+快速操作)
│   │   │       ├── libraries/page.tsx              # 媒体库管理 (CRUD+扫描+文件夹选择器+刮削开关)
│   │   │       ├── scraper/page.tsx               # 刮削器设置 (TMDB API key 管理)
│   │   │       └── users/page.tsx                  # 用户管理 (CRUD: 添加/删除/改角色/重置密码, 末位管理员保护)
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
│   │   │   ├── bottom-tabs.tsx                     # 移动端底部 Tab 栏 (Home/Movies/Search/Settings, md:hidden)
│   │   │   ├── admin-sidebar.tsx                   # 管理侧边栏 (桌面: 垂直侧栏, 移动: 水平滚动导航条)
│   │   │   └── nav-sidebar.tsx                     # 汉堡菜单侧边栏 (Home/Media/Dashboard/User)
│   │   ├── movie/
│   │   │   ├── movie-card.tsx                      # 电影海报卡片 (2:3, 180x270, responsive 模式支持 w-full+aspect-[2/3])
│   │   │   ├── bookmark-card.tsx                   # 书签缩略图卡片 (320px, 编辑/删除/图标)
│   │   │   ├── frame-scrubber.tsx                  # 帧浏览器面板 (两栏布局, 截图到相册, 书签创建)
│   │   │   └── movie-metadata-editor.tsx           # 电影元数据编辑弹窗 (General/Cast/Personal 三 Tab)
│   │   ├── people/
│   │   │   ├── person-card.tsx                     # 演员卡片 (sm/md/lg 三种尺寸)
│   │   │   └── person-metadata-editor.tsx          # 人物元数据编辑弹窗 (General/Personal 两 Tab)
│   │   ├── library/
│   │   │   ├── library-card.tsx                    # 媒体库卡片 (16:9, 320x180)
│   │   │   └── folder-picker.tsx                   # 服务端文件夹选择器弹窗
│   │   ├── player/
│   │   │   ├── player-controls.tsx                  # 底部控制栏 (分组: 书签|模式|播放设置|系统, chip样式文本按钮, 竖线分隔)
│   │   │   ├── player-overlays.tsx                  # 叠加层 (OSD/帮助/书签面板/中央播放按钮)
│   │   │   ├── player-top-bar.tsx                   # 顶部栏 (返回/标题/碟片计数/帮助)
│   │   │   └── panorama-360-player.tsx              # Three.js 360° 全景播放器 (球体+VideoTexture+拖拽/缩放)
│   │   └── ui/                                     # shadcn/ui 组件 (17个)
│   │       ├── avatar.tsx, badge.tsx, button.tsx, card.tsx
│   │       ├── dialog.tsx, dropdown-menu.tsx, input.tsx, label.tsx
│   │       ├── progress.tsx, scroll-area.tsx, scroll-row.tsx, select.tsx
│   │       ├── separator.tsx, slider.tsx, switch.tsx, tabs.tsx
│   │       └── textarea.tsx
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

用户可自定义多个评分维度（如电影的"剧情"、"特效"，人物的"样貌"、"演技"），每个维度独立打分，`personal_rating` 为各维度的平均值。维度定义按用户存储，不同用户可配置不同维度。

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
user_preferences.movie_rating_dimensions = '["剧情","特效"]'   ← 维度定义
                        ↓ (前端读取维度列表，渲染评分 UI)
user_movie_data.dimension_ratings = '{"剧情":9.5,"特效":8.0}' ← 各维度评分
user_movie_data.personal_rating = 8.8                          ← 应用层计算平均值
```

`personal_rating` 作为冗余字段始终保持与维度平均值同步，确保无维度配置的场景（卡片排序、徽章显示）无需解析 JSON。

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
| `/api/settings/personal-metadata` | GET/PUT | 用户偏好设置 (评分维度/卡片标记/书签配置) |
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
- HLS 感知 seek: `seekTo()` 函数通过 POST seek API 重启 FFmpeg, 500ms 防抖 + AbortController 取消进行中的 fetch, 防止快速点击产生多个孤儿 FFmpeg 进程
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
- DB 路径可移植性: `people.photoPath` 存相对路径 (`metadata/people/...`), 运行时用 `resolveDataPath()` 拼绝对路径, 迁移数据目录后无需重新刮削
- 书签系统: B 键快速书签 (使用模板预设), Shift+B 详细书签 (选图标/标签/备注)
- 进度条书签标记: 彩色圆点 + 图标, hover 放大, 点击定位; 支持低调模式 (半透明白色)
- 3 秒无操作自动隐藏控制栏 (可通过 toggle 按钮关闭自动隐藏)

### 360° 全景播放

播放器内置 360° 全景模式, 用户通过控制栏 `360°` 按钮手动开关, 状态跟用户走 (`user_preferences.player_360_mode`)。

**渲染架构** (全部在客户端浏览器执行, Server 仅提供视频流):
```
<video> (hidden, HLS/直连解码) → VideoTexture → SphereGeometry (BackSide) → WebGLRenderer
                                                       ↑ camera at origin
                                                       ↑ Pointer drag → lon/lat → lookAt
```

**组件**: `panorama-360-player.tsx` — Three.js 动态导入 (`ssr: false`), 代码分离为独立 chunk (~500KB), 仅 360 模式激活时加载。

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
| `/` | 首页 | Jellyfin 风格 Tab 导航: Home Tab (媒体库卡片(未扫描显示overlay)+继续观看+最近添加+收藏ScrollRow) / Favorites Tab (全局收藏网格) |
| `/movies?libraryId=X` | 媒体库浏览 | 需 libraryId, 3 Tab: Movies (排序下拉+网格) / Favorites (库内收藏网格) / Genres (按类型分组ScrollRow) |
| `/movies/[id]` | 电影详情 | Jellyfin 风格: fanart 充分可见(仅底部渐变) + 左侧海报(300×450) + 右侧 text-shadow 信息面板(标题/元数据行/小型按钮行/Overview/Metadata 纵向列表) + 帧浏览书签模式(BookmarkPlus按钮, FrameScrubber两栏面板: 帧预览+进度条覆盖层/书签表单+截图到演员相册) + 书签 ScrollRow + 演员卡片 + 推荐 |
| `/movies/[id]/play` | 播放器 | 全屏 + 自动保存进度 + 书签 (B/Shift+B) + 倍速 + 进度条图标标记 + 自动隐藏控制栏 (可 toggle) + 360° 全景模式 |
| `/people/[id]` | 演员详情 | fanart 渐变 + 大卡片 + 参演作品网格 + 照片墙(Justified 行布局+Lightbox+上传/删除) |
| `/search` | 搜索 | 搜索框 + 电影结果 + 演员结果 + 书签剪辑 (按宽高比分横屏/竖屏行) |
| `/settings` | 用户设置 | 个人资料 / 密码 / 语言切换 / 账户信息, i18n |
| `/dashboard` | 管理概览 | 4 个统计卡片 + 活动列表 + 快速操作 |
| `/dashboard/libraries` | 媒体库管理 | 库卡片 + Dialog(含FolderPicker+刮削开关) + 扫描/删除 |
| `/dashboard/scraper` | 刮削器设置 | TMDB API key 管理 (输入/验证/掩码显示) |
| `/dashboard/users` | 用户管理 | 完整 CRUD: 添加用户 / 删除 / 角色切换 / 重置密码, 末位管理员保护, 自删除防护 |
| `/dashboard/networking` | 网络设置 | 端口配置, Docker 模式检测, 重启提示 |
| `/card-badges` | 卡片徽章设置 | 电影卡片(分辨率/评分)和演员卡片(段位)徽章开关, 预览卡片, 可展开规则说明 |
| `/personal-metadata` | 个人元数据 | 多维度评分维度管理, 书签图标管理(内置9个+自定义上传), 快速书签模板 |

### 共享组件

| 组件 | 位置 | 说明 |
|------|------|------|
| `AppHeader` | `components/layout/` | 顶部导航: logo + 导航链接(Home/Dashboard) + 搜索图标 + 头像 (Movies 通过媒体库卡片进入, 不在顶部导航) |
| `AdminSidebar` | `components/layout/` | 管理侧边栏: 概览/媒体库/用户/刮削器/网络, 渐变高亮+圆角指示器 |
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
| **Settings / PersonalMetadata / CardBadges** | `w-[720px]` → `w-full max-w-[720px]`, 容器 `px-4 md:px-0` |
| **Movie Detail** | Hero: 手机端 fanart banner (`h-[220px]`) + 隐藏 poster + 流式布局; 桌面保持 absolute 叠加; Play 按钮 `w-full md:w-auto`; 所有 section `px-4 md:px-20`; View fanart / Bookmark mode 按钮手机端隐藏 |
| **Person Detail** | 与 Movie Detail 同构: fanart banner + 隐藏 poster + 响应式标题/padding |
| **Movies Browse** | `px-12` → `px-4 md:px-12`, 电影网格 `grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,180px)]`, MovieCard 传 `responsive` prop |
| **Dashboard** | AdminSidebar `hidden md:flex` + 移动端水平滚动导航条; layout `flex-col md:flex-row` |

### 组件适配

| 组件 | 适配方式 |
|------|---------|
| **AppHeader** | `px-8` → `px-3 md:px-8` |
| **ScrollRow** | Chevron 按钮 `hidden md:flex`; 添加 `snap-x snap-mandatory md:snap-none` 触控滑动 |
| **MovieCard** | 新增 `responsive` prop: `w-full` + `aspect-[2/3]` 替代固定 180×270, 用于网格布局 |
| **BookmarkCard** | `w-[320px]` → `w-[280px] md:w-[320px]` |
| **Dialog** (MetadataEditor / ImageEditor) | 手机端全屏: `max-h-[100dvh] rounded-none md:rounded-lg` |
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
- i18n 覆盖 auth/setup/settings/home/movies/nav 页面, 包括 Tab 导航标签 + 卡片 hover 操作菜单文案

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
