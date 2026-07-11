"use client";

import { useHasMusicLibrary } from "@/hooks/use-has-music-library";
import { NowPlayingBar } from "@/components/music/now-playing-bar";

/**
 * Renders the NowPlayingBar only when a music library exists. The
 * MusicPlayerProvider (and its persistent <audio>) is mounted separately and
 * unconditionally so playback survives navigation — this gate only controls
 * the visible bar for non-music users.
 */
export function NowPlayingBarGate() {
  const hasMusicLibrary = useHasMusicLibrary();
  if (!hasMusicLibrary) return null;
  return <NowPlayingBar />;
}
