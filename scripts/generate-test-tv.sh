#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# Kubby test-TV generator — FULLY SYNTHETIC timer clips (TV domain)
#
# Sibling of test-media/generate.sh, but for the TV-series domain. Every clip
# is generated purely from ffmpeg lavfi sources (NO external drive / private
# source dependency). Each ~10s clip carries:
#   • a BIG center burned-in timer  HH:MM:SS.mmm  (scales with resolution)
#   • a top self-ID label:  Title SxxExx · container / vcodec / acodec -> DECISION
#   • a moving progress bar along the bottom
# So playback position and seeking are verifiable frame-by-frame, and every
# episode announces its own resolution / codec / expected decidePlayback branch.
#
# NO METADATA: this script writes BARE video files only — NO series.nfo /
# episode .nfo / poster.jpg / fanart.jpg. That is deliberate: with no NFO the
# TV scanner is forced down the real TMDB scrape path (series + season +
# episode lookups), which is exactly what we want to exercise.
#
# Output root is test-tv-media/ (separate from test-media/) so the movie and TV
# test libraries coexist. Folder = "Title (Year)", seasons in "Season NN"
# subfolders ("Specials" for season 0), episode files "Title SxxExx.ext".
#
# Two-step usage:
#   1) bash scripts/generate-test-tv.sh          # (re)generate all timer clips
#   2) npx tsx scripts/scan-test-tv-library.ts   # scan + scrape the TV library
#
# IMPORTANT: because there is NO NFO, the FIRST scan MUST reach TMDB — in CN
# that needs the proxy env (see scripts/scan-test-tv-library.ts header / README).
# Create a tvshow library in the dashboard pointing at test-tv-media first.
# ─────────────────────────────────────────────────────────────
set -uo pipefail   # no -e: one ffmpeg failure shouldn't abort the batch

OUT="D:/AIworkspace/kubby/test-tv-media"
DUR=10                     # clip length (seconds)
FPS=30
BG="0x0e0e16"              # Kubby-dark background
FONT="C\:/Windows/Fonts/consola.ttf"
FONTB="C\:/Windows/Fonts/consolab.ttf"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found"; exit 1; }
FF="ffmpeg -y -hide_banner -loglevel error"

# Build the -vf filtergraph for a given resolution + label.
# Timer/label/bar sizes scale with height so every resolution looks right.
build_vf() {
  local W="$1" H="$2" LABEL="$3"
  local BIG=$(( H / 5 ))
  local LAB=$(( H / 26 )); (( LAB < 16 )) && LAB=16
  local BAR=$(( H / 50 )); (( BAR < 6 )) && BAR=6
  local BW=$(( H / 180 )); (( BW < 2 )) && BW=2
  printf "drawbox=x=0:y=ih-%d:w=iw*t/%d:h=%d:color=0x33ccff@0.9:t=fill," "$BAR" "$DUR" "$BAR"
  printf "drawtext=fontfile='%s':text='%s':fontsize=%d:fontcolor=0x9fe8ff:x=(w-text_w)/2:y=h*0.09:box=1:boxcolor=0x000000@0.4:boxborderw=14," "$FONTB" "$LABEL" "$LAB"
  printf "drawtext=fontfile='%s':text='%%{pts\:hms}':fontsize=%d:fontcolor=white:borderw=%d:bordercolor=0x000000:x=(w-text_w)/2:y=(h-text_h)/2" "$FONT" "$BIG" "$BW"
}

# render_ep <folder_relpath> <outfile> <W> <H> <label> -- <ffmpeg output opts...>
#   folder_relpath e.g. "Breaking Bad (2008)/Season 01"
#   writes to $OUT/<folder_relpath>/<outfile>
render_ep() {
  local folder="$1" out="$2" W="$3" H="$4" LABEL="$5"; shift 5
  mkdir -p "$OUT/$folder"
  echo "  → $folder/$out  (${W}x${H})"
  $FF -f lavfi -i "color=c=${BG}:s=${W}x${H}:r=${FPS}:d=${DUR}" \
      -f lavfi -i "sine=frequency=440:duration=${DUR}" \
      -vf "$(build_vf "$W" "$H" "$LABEL")" \
      "$@" -t "$DUR" "$OUT/$folder/$out"
}

# Encoding flag presets (copied verbatim from test-media/generate.sh render calls)
H264_AAC=(-c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 96k)
HEVC_AAC=(-c:v libx265 -preset veryfast -crf 30 -tag:v hvc1 -pix_fmt yuv420p -c:a aac -b:a 96k)
H264_AC3=(-c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -c:a ac3 -b:a 192k)
MPEG4_MP3=(-c:v mpeg4 -vtag XVID -qscale:v 5 -c:a libmp3lame -q:a 4)

# =============================================================
# Breaking Bad (2008) — mixed codecs/containers, 2 seasons
# =============================================================
echo "== Breaking Bad (2008) =="

render_ep "Breaking Bad (2008)/Season 01" "Breaking Bad S01E01.mkv" 1280 720 \
  "Breaking Bad S01E01   mkv / h264 / aac   ->  REMUX" \
  "${H264_AAC[@]}"

render_ep "Breaking Bad (2008)/Season 01" "Breaking Bad S01E02.mp4" 1280 720 \
  "Breaking Bad S01E02   mp4 / h264 / aac   ->  DIRECT" \
  "${H264_AAC[@]}"

render_ep "Breaking Bad (2008)/Season 01" "Breaking Bad S01E03.avi" 640 480 \
  "Breaking Bad S01E03   avi / mpeg4 / mp3   ->  TRANSCODE" \
  "${MPEG4_MP3[@]}"

render_ep "Breaking Bad (2008)/Season 02" "Breaking Bad S02E01.mp4" 1280 720 \
  "Breaking Bad S02E01   mp4 / h264 / ac3   ->  REMUX (audio)" \
  "${H264_AC3[@]}"

# =============================================================
# Attack on Titan (2013) — h264 remux + hevc direct
# =============================================================
echo "== Attack on Titan (2013) =="

render_ep "Attack on Titan (2013)/Season 01" "Attack on Titan S01E01.mkv" 1280 720 \
  "Attack on Titan S01E01   mkv / h264 / aac   ->  REMUX" \
  "${H264_AAC[@]}"

render_ep "Attack on Titan (2013)/Season 01" "Attack on Titan S01E02.mp4" 1280 720 \
  "Attack on Titan S01E02   mp4 / hevc / aac   ->  DIRECT (hvc1)" \
  "${HEVC_AAC[@]}"

# =============================================================
# Sherlock (2010) — direct mp4 episodes + a Specials (Season 0) entry
# =============================================================
echo "== Sherlock (2010) =="

render_ep "Sherlock (2010)/Season 01" "Sherlock S01E01.mp4" 1280 720 \
  "Sherlock S01E01   mp4 / h264 / aac   ->  DIRECT" \
  "${H264_AAC[@]}"

render_ep "Sherlock (2010)/Season 01" "Sherlock S01E02.mp4" 1280 720 \
  "Sherlock S01E02   mp4 / h264 / aac   ->  DIRECT" \
  "${H264_AAC[@]}"

render_ep "Sherlock (2010)/Specials" "Sherlock S00E01.mkv" 1280 720 \
  "Sherlock S00E01   mkv / h264 / aac   ->  REMUX (Specials)" \
  "${H264_AAC[@]}"

echo ""
echo "=== DONE. Synthetic TV timer matrix generated under $OUT ==="
echo "NO NFO/poster/fanart written → first scan MUST reach TMDB (CN: proxy env)."
echo "Create a tvshow library pointing at test-tv-media, then:"
echo "  npx tsx scripts/scan-test-tv-library.ts"
