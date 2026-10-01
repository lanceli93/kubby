# Closed-loop & authorization audit (2026-10-01)

Audit of "open-loop" gaps (things you can create/enable but not edit/undo/delete,
dead buttons, silent failures) plus API authorization. Shared helpers already in
place: `src/lib/auth-guard.ts` (`requireUser()` / `requireAdmin()`, DB-backed) and
`src/hooks/use-is-admin.ts` (`useIsAdmin()`).

Policy: shared/global things (libraries, global settings, media metadata edits,
media deletes, music upload, user management, demo teardown) are **admin-only**
server-side and hidden in the UI for non-admins. Personal things (ratings,
favorites, bookmarks, progress, own preferences/profile) stay per-user login-only.

## E1 — API authorization (server)
- [x] Admin guard on libraries POST/PUT/DELETE, scan, cover; settings networking (GET+PUT), nfo-writeback PUT, scraper handled in E6; filesystem = admin OR setup mode; music upload + tracks/albums/artists PUT/DELETE; movies/tv/people PUT/DELETE + `/images` POST/DELETE. Login guard on photos/albums/**. Acceptance: non-admin cookie gets 403, admin unaffected, tsc clean.

## E3 — Demo lifecycle + system dashboard
- [x] `DELETE /api/setup/demo` admin-only; status reports leftover demo account; panel shows while demo libs OR demo account exist; "remove demo account" action; factory reset honest when other users exist; signed-in-as-demo handled; admin-visible "Demo" badge in header linking to the panel.
- [x] "Scan All Libraries" quick action works; TV library count says episodes; Recent Activity shows real data (derived from DB); dashboard APIs admin-only.

## E4 — Users & accounts
- [x] Users page: labeled row actions + Edit dialog (display name, username, role); `PUT /api/users/[id]` accepts displayName/username (unique).
- [x] Profile display-name save refreshes the session (header/sidebar update without re-login).
- [x] Login hides "Register" after setup; `/register` shows a "ask your admin" state instead of a 403 dead-end.

## E5a — Cinema / TV / People content
- [x] Edit/delete/image controls hidden for non-admins.
- [x] All mutations check `res.ok`, show an error toast, never navigate away on failure.
- [x] Poster/fanart delete asks for confirmation.
- [x] Mark watched/unwatched resets resume position.
- [x] Continue Watching items can be dismissed.
- [x] Hardcoded strings in bookmark-card / loading / aria labels / en-US dates localized.

## E5b — Photos
- [x] Admin can delete a photo/video (file + DB + thumbs) with confirmation, from lightbox and multi-select.
- [x] "Set as album cover" action in album view.
- [x] Album mutations check `res.ok` + error feedback; lightbox strings localized.

## E6 — Libraries page / setup wizard / scraper
- [x] Library create/edit/delete check `res.ok` + error toasts; create blocked without a folder.
- [x] Hardcoded English on libraries + metadata/browse pages localized.
- [x] Dashboard "Add Library" quick action opens the add dialog (`?add=1`).
- [x] TMDB key can be removed; scraper route admin-only for PUT/DELETE.
- [x] Setup wizard offers all four library types (no stale "coming soon").

## E7 — Preferences
- [x] Bookmark-icon delete confirms; deleting the quick-bookmark template's icon falls back to default.
- [x] Card badges / hero mosaic / playback / ratings-bookmarks pages have "Reset to defaults".
- [x] Language change gives toast feedback; playback page strings localized.

## Orchestrator follow-ups (done)
- [x] Dashboard quick actions deep-link into the Add Library / Add User dialogs (`?add=1`, read via `window.location` so no Suspense boundary is needed).
- [x] Users page: labeled inline Edit / Reset password / Delete buttons (E4's ⋯ menu still hid delete) + "(you)" marker.
- [x] Recursive person-folder deletes confined to Kubby's metadata dirs (`isPathInside`) — NFO-supplied `photo_path` could point at another instance's data dir.
- [x] Browser-verified end-to-end on an isolated instance: demo seed → create own admin → sign in → remove demo account → clear demo libraries (badge + panel disappear, `{dataDir}/demo` removed); non-admin sees no edit/delete; Continue Watching dismiss; register disabled state; reset-to-defaults.

## Deferred
- Person gallery upload/delete/reorder is still login-only (player's "save screenshot to actor" needs it) — decide if it should be admin-only.
- Photo albums are global but any user can rename/delete them.
- Cancelling an in-progress library scan (needs AbortController plumbing through the scanner).
- "Hide from Next Up" for TV (needs a schema flag).
- Stream URLs are intentionally unauthenticated (external players) — revisit with signed URLs.
