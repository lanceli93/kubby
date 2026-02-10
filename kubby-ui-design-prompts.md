# Kubby UI 设计 - Pencil MCP 页面设计 Prompts

## 设计风格总纲

**整体风格**: 深色影院 (Dark Cinema) + 卡片式布局
**参考**: Jellyfin / Plex / Netflix 风格融合
**配色方向**:
- 背景: 极深色 (#0a0a0f ~ #111118)
- 卡片/表面: 微亮深色 (#1a1a2e ~ #16213e)
- 主强调色: 蓝紫或青色 (#6366f1 / #3b82f6)
- 文字: 暖白 (#f0f0f5) / 次要灰 (#8888a0)
- 评分/高亮: 金色 (#f5c518)
- 危险操作: 红色 (#ef4444)

**字体**: Inter / 系统字体栈
**圆角**: 卡片 12px, 按钮 8px, 头像圆形
**阴影**: 微妙的深色阴影增强层次感

---

## 页面 1: 登录页 (Login)

**尺寸**: 1440x900 (桌面)

**Prompt**:
```
Design a login page for a media server app called "Kubby". Dark cinema theme with near-black background (#0a0a0f). Center of the page has a card (480px wide, rounded-xl, subtle border, dark surface #1a1a2e) containing:
- Top: "Kubby" logo text in bold, large font with a subtle blue glow effect
- Below logo: "Sign in to your account" subtitle in muted gray
- Username input field with label, dark input background (#0f0f1a), rounded-lg border
- Password input field with label, same style, with a show/hide toggle icon
- "Sign In" button, full width, primary blue (#3b82f6), rounded-lg, bold text
- Below button: "Don't have an account? Register" link in muted blue
- Footer: small muted text "Kubby Media Server"

Background: very dark, optionally with a subtle radial gradient or very faint film-grain texture. No sidebar, no header - just the centered card. Clean, minimal, cinematic feel.
```

---

## 页面 2: 注册页 (Register)

**尺寸**: 1440x900

**Prompt**:
```
Design a registration page for "Kubby" media server. Same dark cinema style as the login page. Centered card (480px wide) on near-black background (#0a0a0f):
- Top: "Kubby" logo text, bold
- Subtitle: "Create your account"
- Username input field with label
- Display Name input field with label (optional badge)
- Password input field with label
- Confirm Password input field with label
- "Create Account" button, full width, primary blue
- Below button: "Already have an account? Sign in" link
- Small info note: "The first user will automatically become admin" in muted text

Same dark input styling (#0f0f1a background, subtle border, rounded-lg). Match the login page visual style exactly.
```

---

## 页面 3: 首页 (Home)

**尺寸**: 1440x900

**Prompt**:
```
Design a home/landing page for "Kubby" media server after login. Dark cinema theme (#0a0a0f background).

Top: App header bar (sticky, #111118 background, subtle bottom border)
- Left: "Kubby" logo text
- Center/left: Navigation links: "Home" (active, highlighted), "Movies", "Dashboard"
- Right: Search icon, User avatar circle with dropdown indicator

Main content area with vertical sections, each containing a horizontal scrollable row of movie poster cards:

Section 1: "Continue Watching" with a progress bar indicator on each card
- 6 movie poster cards visible (aspect ratio 2:3, ~180px wide, ~270px tall)
- Each card: poster image fills the card, bottom gradient overlay, movie title text, thin progress bar (blue) at the very bottom showing watch progress

Section 2: "Recently Added"
- Same card style but without progress bars
- Each card: poster image, title at bottom, small rating badge (gold circle with number like "8.5") at top-right corner

Section 3: "Favorites"
- Same card style, with a small heart icon at top-left indicating favorite
- Each card: poster image, title, year below title in muted text

Cards should have rounded-xl corners, subtle hover glow effect indication, consistent spacing (16px gap). The overall feel should be like Netflix/Jellyfin - dark, cinematic, content-focused with poster-dominant layout.
```

---

## 页面 4: 电影浏览页 (Movie Browse)

**尺寸**: 1440x900

**Prompt**:
```
Design a movie browse/library page for "Kubby" media server. Dark cinema theme.

Top: Same app header as home page with "Movies" nav link highlighted.

Below header: Filter/sort toolbar bar (subtle dark surface, 48px height)
- Left side: Genre dropdown filter ("All Genres"), Year dropdown filter ("All Years")
- Right side: Sort dropdown ("Recently Added" / "Title" / "Year" / "Rating"), Grid/List view toggle icons
- Optional: Search input field integrated in the toolbar

Main content: Responsive grid of movie poster cards
- Desktop: 6 columns of poster cards
- Each card (2:3 aspect ratio, ~200px wide):
  - Full poster image
  - Bottom gradient overlay with: movie title (white, medium weight), year (muted gray, small)
  - Top-right: rating badge (small gold circle, "8.5")
  - Hover state: subtle scale-up, brightness increase, border glow
  - Unplayed indicator: small blue dot at top-left (optional)

Bottom: Pagination or "Load More" button centered, muted style

Show approximately 24 movie cards (4 rows x 6 columns) filling the grid. Use realistic-looking placeholder poster images. Dark background (#0a0a0f), cards with rounded-xl corners.
```

---

## 页面 5: 电影详情页 (Movie Detail) ← 核心页面

**尺寸**: 1440x1200 (需要滚动)

**Prompt**:
```
Design a movie detail page for "Kubby" media server. This is the most important page. Dark cinema theme.

Top: Same app header.

Hero section (full width, 450px height):
- Full-width fanart/backdrop image as background (a cinematic wide shot)
- Heavy gradient overlay: transparent at top, fading to near-black (#0a0a0f) at bottom
- This creates an immersive cinematic banner effect

Content section (overlapping the hero bottom by ~120px, creating a layered effect):
Left column (240px wide):
- Movie poster image, rounded-xl corners, subtle shadow, positioned to overlap the hero banner bottom

Right column (remaining width, to the right of poster):
- Movie title: large (32px), bold, white
- Original title in smaller muted text (if different from title)
- Metadata line: "2023 · 2h 15m · PG-13 · ★ 8.5" in muted gray with gold star
- Genre tags: horizontal row of small rounded badges ("Action", "Thriller", "Sci-Fi") in subtle dark surface with border
- Action buttons row:
  - Large "Play" button (primary blue, with play icon, rounded-lg)
  - "Favorite" heart icon button (outline, toggleable)
  - "Mark as Watched" check icon button
- Separator line
- Overview/plot text: 3-4 lines of descriptive text in light gray, normal weight

Cast section (below the poster+metadata area, full width):
- Section title: "Cast" in medium weight
- Horizontal scrollable row of actor cards (6-8 visible):
  - Each actor card: circular photo (80px diameter), actor name below (small, white), character/role name below that (smaller, muted gray)
  - Cards spaced 24px apart

Additional info section:
- "Director: Christopher Nolan" line
- "Studio: Warner Bros." line
- "Country: USA" line
- Small muted external ID text: "TMDb: 12345 · IMDb: tt1234567"

Overall layout should feel like Jellyfin/Plex detail pages - immersive fanart hero, informative but not cluttered, dark cinematic atmosphere.
```

---

## 页面 6: 演员详情页 (Person Detail)

**尺寸**: 1440x900

**Prompt**:
```
Design a person/actor detail page for "Kubby" media server. Dark cinema theme.

Top: Same app header.

Person info section (top area, ~200px height):
- Left: Large circular actor photo (160px diameter), subtle border, shadow
- Right of photo:
  - Person name: large bold text (28px)
  - Person type: "Actor" badge in muted style
  - Optional: brief bio or info line in muted text

Filmography section (below person info):
- Section title: "Filmography" or "Appearances" with count badge "(12 movies)"
- Grid of movie poster cards (same style as movie browse page, 6 columns)
- Each card shows the movie poster with title and year
- Below each card title: the character/role name in muted text (e.g., "as Tony Stark")
- Cards sorted by year (newest first)

Show 8-12 movie cards in the filmography grid. Dark background, consistent card styling with the rest of the app.
```

---

## 页面 7: 视频播放器 (Video Player)

**尺寸**: 1440x900

**Prompt**:
```
Design a fullscreen video player interface for "Kubby" media server. Very dark theme.

Full viewport dark background (#000000), simulating a video playing.

Overlay controls (semi-transparent gradient from bottom, visible on hover):
- Bottom section:
  - Progress/seek bar: thin line that expands on hover, blue (#3b82f6) for played portion, gray for remaining, small circular thumb/knob
  - Time display: "1:23:45 / 2:15:00" in small white text
  - Control buttons row (centered):
    - Skip backward 10s icon button
    - Play/Pause large icon button (most prominent)
    - Skip forward 10s icon button
  - Right side of controls:
    - Volume icon + slider
    - Subtitles icon (for future)
    - Settings gear icon (for future)
    - Fullscreen toggle icon

Top overlay (semi-transparent gradient from top):
- Left: Back arrow button + Movie title text
- Right: small "Kubby" logo text

Center of screen: Large play/pause button (appears on click, fades out)

The overall feel should be clean and minimal like modern video players (VLC/Netflix style), with controls that appear on mouse hover and fade when idle.
```

---

## 页面 8: 用户设置页 (User Settings)

**尺寸**: 1440x900

**Prompt**:
```
Design a user settings page for "Kubby" media server. Dark cinema theme.

Top: Same app header with user avatar highlighted or "Settings" visible.

Main content: centered container (max-width 720px) with vertical sections:

Section 1: "Profile" card (dark surface #1a1a2e, rounded-xl, padding)
- User avatar (large circle, 96px) with an "Edit" overlay icon on hover
- Display Name input field with label
- Username (shown as read-only text, not editable)
- "Save Changes" button (primary blue)

Section 2: "Change Password" card (same dark surface style)
- Current Password input field
- New Password input field
- Confirm New Password input field
- "Update Password" button (primary blue)

Section 3: "Account Info" card
- Account type: "Administrator" or "User" badge
- Member since: date text
- Play count: number

Each section card has subtle border, rounded corners, proper padding (24px). Form inputs use the same dark input style as login page. Labels above inputs in muted smaller text.
```

---

## 页面 9: 管理控制台 (Admin Dashboard)

**尺寸**: 1440x900

**Prompt**:
```
Design an admin dashboard page for "Kubby" media server. Dark cinema theme.

Top: Same app header with "Dashboard" nav link highlighted.

Left sidebar (240px wide, dark surface #111118, full height):
- Section title: "Administration" in muted uppercase small text
- Nav items (vertical list, icon + label):
  - "Overview" (active, highlighted with blue left border)
  - "Media Libraries" (folder icon)
  - "Users" (people icon)
  - Each item: icon on left, label text, hover highlights

Main content area (right of sidebar):

Top row: 4 stat cards in a horizontal row
- "Total Movies" card: large number (247), film icon, dark surface card
- "Media Libraries" card: large number (3), folder icon
- "Users" card: large number (5), people icon
- "Disk Usage" card: "128.5 GB", hard drive icon
Each stat card: dark surface (#1a1a2e), rounded-xl, subtle border, icon in top-right colored muted

Below stats: "Recent Activity" section
- List of recent activities in a card:
  - "Library 'Movies' scan completed - 15 new movies added" with timestamp
  - "User 'john' registered" with timestamp
  - "Library 'Action Films' created" with timestamp
- Each activity: icon on left, description text, muted timestamp on right

Below activity: "Quick Actions" section
- Row of action buttons:
  - "Scan All Libraries" button (outline style, refresh icon)
  - "Add Library" button (outline style, plus icon)
  - "Add User" button (outline style, user-plus icon)

Clean grid layout, consistent dark surfaces, subtle borders for separation.
```

---

## 页面 10: 媒体库管理 (Library Management)

**尺寸**: 1440x900

**Prompt**:
```
Design a media library management page for "Kubby" admin dashboard. Dark cinema theme.

Top: Same app header.
Left: Same admin sidebar with "Media Libraries" item active.

Main content:

Top bar:
- Page title: "Media Libraries" (large text)
- Right: "Add Library" button (primary blue, plus icon)

Library cards grid (2 columns):
Each library card (dark surface #1a1a2e, rounded-xl, padding 24px):
- Top row: Library name ("My Movies") in bold + library type badge ("Movie" in muted rounded badge)
- Info line: folder path in monospace muted text ("/media/movies")
- Stats line: "247 movies · Last scanned: 2 hours ago"
- Progress bar if currently scanning (blue, animated)
- Bottom row: action buttons
  - "Scan Now" button (outline, refresh icon)
  - "Delete" button (outline, red text, trash icon)

Also show an "Add Library" dialog/modal overlay:
- Dialog card (500px wide, dark surface, rounded-xl):
  - Title: "Add Media Library"
  - "Library Name" input field
  - "Library Type" dropdown (showing "Movie" selected, with disabled options "TV Shows", "Music" grayed out)
  - "Folder Path" input field with a folder browse icon button
  - Bottom: "Cancel" (ghost button) + "Create Library" (primary blue button)

Show 3 library cards in the grid and the dialog overlay on top with a dark backdrop blur.
```

---

## 设计执行顺序

1. 先获取 style guide tags 和适合的 style guide
2. 按以下顺序设计（从核心到辅助）:
   1. **电影详情页** (页面 5) - 最核心、最复杂的页面，定义视觉基调
   2. **首页** (页面 3) - 第二重要，定义卡片样式
   3. **电影浏览页** (页面 4) - 复用首页卡片样式
   4. **登录页** (页面 1) - 独立页面，定义表单样式
   5. **注册页** (页面 2) - 复用登录页样式
   6. **演员详情页** (页面 6) - 复用卡片和详情页样式
   7. **视频播放器** (页面 7) - 独立全屏页面
   8. **管理控制台** (页面 9) - 定义 dashboard 布局
   9. **媒体库管理** (页面 10) - 复用 dashboard 布局
   10. **用户设置页** (页面 8) - 最简单的表单页面
3. 每个页面设计完成后截图验证
4. 全部完成后检查风格一致性
