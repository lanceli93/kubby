# Music Library — Implementation Tasks & Shared Contract

> Working checklist for the music domain (3rd domain after cinema + photos).
> Follows `docs/music-library-design.md`. Dark cinema theme, film-like hover/tilt.
> Each task has a one-line acceptance criterion. Orchestrator owns commits.

## Ground rules (read before any task)

- **Do NOT fork the movie code path.** Add a `music` branch alongside `photo`.
- **Schema double-update rule**: any table/column added to `src/lib/db/schema.ts`
  MUST also get a matching `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` in the
  `pending` array in `src/lib/db/index.ts` (runs on every startup, try/catch).
- Dark theme only — reuse `--surface`, `--header`, `text-muted-foreground`,
  `glass-btn`, `glass-badge`, `transition-fluid`, `TiltCard`, `animate-fade-in-up`.
- Paths via `src/lib/paths.ts` helpers, never hardcoded. Cover art stored under
  `metadata/music-art/{libraryId}/` (relative paths in DB via `toRelativeDataPath`).
- TypeScript strict; run `npx tsc --noEmit` before declaring a task done.
- Music library forces `scraperEnabled=false, jellyfinCompat=false,
  metadataLanguage=null` (same as photo).

## Data model (T1 — authoritative)

Tables (all in schema.ts + db/index.ts migrations 0038+):

```
music_artists      id(pk), name UNIQUE, sortName, imagePath, imageBlur, overview,
                   musicbrainzId, dateAdded
music_albums       id(pk), libraryId FK->media_libraries CASCADE, title, sortTitle,
                   year, coverPath, coverBlur, folderPath, genres(JSON text),
                   musicbrainzId, dateAdded
                   index: idx_ma_library(libraryId)
music_album_artists albumId FK->music_albums CASCADE, artistId FK->music_artists CASCADE
                   unique idx (albumId, artistId); index idx_maa_artist(artistId)
music_tracks       id(pk), libraryId FK CASCADE, albumId FK->music_albums CASCADE (nullable),
                   filePath UNIQUE, fileName, title, sortTitle, trackNumber, discNumber,
                   durationSeconds(real), codec, bitrate, sampleRate, channels, fileSize,
                   genres(JSON text), year, lyricsPath, mimeType,
                   dateAdded, dateModified(int ms)
                   index: idx_mt_library(libraryId), idx_mt_album(albumId)
music_track_artists trackId FK->music_tracks CASCADE, artistId FK->music_artists CASCADE
                   unique idx (trackId, artistId); index idx_mta_artist(artistId)
user_track_data    id(pk), userId FK CASCADE, trackId FK->music_tracks CASCADE,
                   playCount(int default 0), isFavorite(bool default 0), lastPlayedAt
                   unique idx (userId, trackId)
```

Drizzle exports: `musicArtists, musicAlbums, musicAlbumArtists, musicTracks,
musicTrackArtists, userTrackData`. Migration comments: `// 0038: music domain tables`.
Add `getMusicArtDir()` to paths.ts → `metadata/music-art`.

## Scanner contract (T3)

`scanMusicLibrary(library, onProgress?)` in `src/lib/scanner/music-scanner.ts`,
dispatched from `scanner/index.ts` when `library.type === "music"` (mirror the
`=== "photo"` dispatch). Returns `{ scannedCount, removedCount, skipped }`.

- Audio exts: `.mp3 .flac .m4a .aac .ogg .opus .wav .wma .aiff .alac`.
- Use `music-metadata` (`import { parseFile } from "music-metadata"`) per file:
  title/album/albumartist/artist(s)/track/disc/year/genre/duration/codec/
  bitrate/sampleRate/numberOfChannels + embedded picture.
- Album grouping key = `albumartist||album` (fallback artist||album, then folder).
  Artists aggregated ONLY via `music_album_artists` / `music_track_artists` maps —
  never physical folders. Various-Artists albums resolve naturally.
- Cover priority: album folder `cover.* folder.* albumart.*` > embedded picture
  (extract to `metadata/music-art/{libraryId}/{albumId}.jpg` via fs write) > none.
  Generate `coverBlur` with existing `generateBlurDataURL` from `lib/blur-utils`.
- Incremental: skip unchanged files by `dateModified === mtimeMs && fileSize`.
- Cleanup rows whose files vanished; delete albums/artists left with no tracks.
- Concurrency pool of 4 (copy `runPool` from photo-scanner).
- Tracks with no album tag → `albumId=null` (surface under "Unknown Album").

## API contract (T4 + T5) — all under /api/music

- `GET /api/music/albums?libraryId=&sort=&sortOrder=&search=&offset=&limit=` →
  `{ items:[{id,title,year,coverPath,coverBlur,artistName,trackCount}], totalCount, offset, limit, hasMore }`
  artistName = joined album-artist names. sort: title|year|dateAdded (default dateAdded desc).
- `GET /api/music/albums/[id]` → `{ id,title,year,coverPath,coverBlur,genres,artists:[{id,name}],
  tracks:[{id,title,trackNumber,discNumber,durationSeconds,artistName,isFavorite,playCount}] }`
  tracks ordered by discNumber, trackNumber.
- `GET /api/music/artists?libraryId=&sort=&search=&offset=&limit=` →
  `{ items:[{id,name,imagePath,imageBlur,albumCount,trackCount}], totalCount, offset, limit, hasMore }`
- `GET /api/music/artists/[id]` → `{ id,name,imagePath,imageBlur,overview,
  albums:[{id,title,year,coverPath,coverBlur,trackCount}] }`
- `GET /api/music/songs?libraryId=&sort=&search=&offset=&limit=` →
  `{ items:[{id,title,durationSeconds,artistName,albumId,albumTitle,coverPath,coverBlur,trackNumber,isFavorite}], totalCount, offset, limit, hasMore }`
- `GET /api/music/home?libraryId=` → `{ recentAlbums:[album...], randomAlbums:[album...], mostPlayed:[track...] }` (album shape = albums list item).
- `GET /api/music/tracks/[id]/user-data` (GET returns {isFavorite,playCount}) +
  `PUT` body `{isFavorite?}` or `{incrementPlay:true}`. Upsert on (userId,trackId).
- `GET /api/music/tracks/[id]/cover` → serves album cover (reuse resolveDataPath+sharp path) — OPTIONAL, prefer reusing `/api/images` with coverPath. Use `resolveImageSrc(coverPath, w)` on the client instead → SKIP a dedicated cover route unless needed.
- `GET /api/music/tracks/[id]/stream` (T5): HTTP 206 Range for browser-native
  codecs (mp3/aac/flac/ogg/opus/wav) — serve original file (copy photo `file`
  route's Range logic). For non-native (wma/aiff/alac/dsf) → ffmpeg pipe to mp3
  (`ffmpeg -i in -f mp3 -ab 192k pipe:1`), no Range. Add
  `src/lib/music/audio-decider.ts` deciding native vs transcode by codec/ext.

## Global player (T7)

- `src/providers/music-player-provider.tsx`: Zustand-free external-store singleton
  (mirror `scan-provider.tsx`'s `useSyncExternalStore` pattern) holding
  `{ queue:Track[], index, isPlaying, currentTime, duration, volume, shuffle, repeat }`
  + actions `playTrack(track, queue?)`, `playAlbum(tracks, startIndex)`, toggle,
  next, prev, seek, setShuffle, setRepeat. A single persistent `<audio>` element
  lives in the provider (NOT in any page) so navigation never stops playback.
- `NowPlayingBar` (`src/components/music/now-playing-bar.tsx`): fixed bottom bar,
  cover thumb + title/artist + transport + seek bar + volume; click cover/title →
  expand full-screen Now Playing overlay. Bar sits above BottomTabs on mobile.
- On track start, fire `PUT /api/music/tracks/[id]/user-data {incrementPlay:true}`.
- Mount `<MusicPlayerProvider>` in `(main)/layout.tsx` wrapping children +
  render `<NowPlayingBar/>` there (only when a music library exists, gate inside).

## UI components (T6) + pages (T8)

- `album-card.tsx`: square cover (aspect-square, ~180px), TiltCard + ambilight
  blur glow on hover (copy MovieCard's `posterBlur` ambient-glow div + TiltCard),
  centered play button overlay on hover (plays album), title + artist below.
  Click → `/music/albums/[id]`.
- `artist-card.tsx`: circular image (rounded-full), name + "N albums" below.
- `track-row.tsx`: list row — track#, title, artist, duration, hover shows play +
  favorite; row highlights when it is the current track.
- `/music/page.tsx`: Tabs (Albums / Artists / Songs) mirroring movies page tab
  shell; each tab a responsive grid/list with infinite scroll + sort dropdown
  (reuse the glass sort dropdown pattern). Home content (recent/random/mostplayed)
  can be a "Home"/"Overview" first tab OR the Albels tab default — orchestrator
  chose: first tab = "专辑/Albums" grid, plus a top ScrollRow band of recent albums.
- `/music/albums/[id]/page.tsx`: hero = big cover + album meta + "Play all" +
  track list (track-row). Ambient color from cover.
- `/music/artists/[id]/page.tsx`: artist header + album grid.

## Checklist

- [x] T1 schema + migrations + paths helper
- [x] T2 domain wiring (nav, cookie, auth redirect, header, libraries API, form, i18n)
- [x] T3 music scanner + dispatch
- [x] T4 music API routes (albums/artists/songs/home/user-data)
- [x] T5 audio stream route + audio-decider
- [x] T6 album-card / artist-card / track-row
- [x] T7 music-player-provider + NowPlayingBar + layout mount
- [x] T8 /music pages (tabs, album detail, artist detail)
- [x] T9 verify build + run in fresh Chrome tab + screenshot + docs + commit
