# Domain-aware navigation & settings (Plan A)

Goal: sidebar / preferences / library dashboard / bottom tabs follow the current
media domain (cinema / photos / music) instead of being movie-centric.

Shared building blocks (already done by orchestrator, do NOT recreate):
- `src/hooks/use-current-domain.ts` — `useCurrentDomain(): "cinema" | "photos" | "music"`.
  Path-owned routes decide directly; neutral pages (search/profile/preferences/
  dashboard) fall back to the `kubby-domain` cookie. Hydration-safe.
- i18n keys added to `src/i18n/messages/{en,zh}.json`:
  - `nav.allPhotos`, `nav.allMusic`
  - `preferences.groupCinema`, `preferences.groupGeneral`
  - `dashboard.libraryTypeMovie`

## Tasks

- [x] T1 NavSidebar follows domain (`src/components/layout/nav-sidebar.tsx`)
      Acceptance: in photos domain the Media group shows "All Photos" only; in
      music domain "All Music" only; in cinema domain "All Movies" + the
      Metadata group (providers/browse). Metadata group hidden outside cinema.
      Home/Admin/User groups unchanged. Domain via useCurrentDomain().
- [x] T2 PreferencesSidebar grouped by domain (`src/components/layout/preferences-sidebar.tsx`)
      Acceptance: two labelled groups — Cinema (hero-mosaic, card-badges,
      ratings-bookmarks, playback) and General (language). Routes unchanged.
      Desktop aside + mobile horizontal nav both grouped (mobile can render a
      flat list but keep order cinema→general). `/preferences` redirect target
      unchanged.
- [x] T3 Libraries dashboard sectioned by type + hygiene (`src/app/(main)/dashboard/libraries/page.tsx`)
      Acceptance: cards grouped into sections (Movies / Photos / Music) with
      per-type headers using dashboard.libraryTypeMovie/Photo/Music; sections
      with no libraries hidden. Replace the `type !== "photo" && type !== "music"`
      blocklist branches with `type === "movie"` allowlist (3 sites). Scan All
      unchanged.
- [x] T4 BottomTabs show current-domain media tab only (`src/components/layout/bottom-tabs.tsx`)
      Acceptance: middle media slot renders exactly one tab for the current
      domain (Movies / Photos / Music); Home, Search, Preferences fixed.
      Player-page hides also apply to photo viewer `/photos/view/[id]` (video
      may play there) — keep existing movie player hide.
