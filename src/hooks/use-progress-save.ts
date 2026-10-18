"use client";

import { useEffect, useCallback, useRef } from "react";

interface UseProgressSaveOptions {
  movieId: string;
  /** API base path for the user-data route, e.g. `/api/movies/${movieId}`. */
  basePath: string;
  currentDisc: number;
  isPlaying: boolean;
  getRealTime: () => number;
}

function fireProgressSave(basePath: string, seconds: number, disc?: number, countPlay?: boolean) {
  fetch(`${basePath}/user-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playbackPositionSeconds: Math.floor(seconds),
      ...(disc !== undefined ? { currentDisc: disc } : {}),
      ...(countPlay ? { countPlay: true } : {}),
    }),
  }).catch(() => {});
}

export function useProgressSave({ basePath, currentDisc, isPlaying, getRealTime }: UseProgressSaveOptions) {
  const isPlayingRef = useRef(isPlaying);
  const currentDiscRef = useRef(currentDisc);
  isPlayingRef.current = isPlaying;
  currentDiscRef.current = currentDisc;

  // Play counting: one playback session = one play. Sessions are keyed by
  // basePath, so navigating to another episode in the same mounted player
  // starts a new session, while a disc switch within one movie does not.
  // The first progress save of a session carries `countPlay: true` (the first
  // interval save fires after ~10s of real playback — a natural "watched"
  // threshold); a mutate() before that (exit / ended) carries it instead,
  // but only once playback has actually started in this session.
  const startedForRef = useRef<string | null>(null);
  const countedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (isPlaying) startedForRef.current = basePath;
  }, [isPlaying, basePath]);

  const takeCountPlay = useCallback(() => {
    if (countedForRef.current === basePath || startedForRef.current !== basePath) return false;
    countedForRef.current = basePath;
    return true;
  }, [basePath]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        fireProgressSave(basePath, getRealTime(), currentDiscRef.current, takeCountPlay());
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [basePath, getRealTime, takeCountPlay]);

  const mutate = useCallback(
    (data: { seconds: number; disc?: number }) =>
      fireProgressSave(basePath, data.seconds, data.disc, takeCountPlay()),
    [basePath, takeCountPlay],
  );

  return { mutate };
}
