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

function fireProgressSave(basePath: string, seconds: number, disc?: number) {
  fetch(`${basePath}/user-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playbackPositionSeconds: Math.floor(seconds),
      ...(disc !== undefined ? { currentDisc: disc } : {}),
    }),
  }).catch(() => {});
}

export function useProgressSave({ basePath, currentDisc, isPlaying, getRealTime }: UseProgressSaveOptions) {
  const isPlayingRef = useRef(isPlaying);
  const currentDiscRef = useRef(currentDisc);
  isPlayingRef.current = isPlaying;
  currentDiscRef.current = currentDisc;

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        fireProgressSave(basePath, getRealTime(), currentDiscRef.current);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [basePath, getRealTime]);

  const mutate = useCallback(
    (data: { seconds: number; disc?: number }) => fireProgressSave(basePath, data.seconds, data.disc),
    [basePath],
  );

  return { mutate };
}
