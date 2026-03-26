"use client";

import { useEffect, useCallback, useRef } from "react";

interface UseProgressSaveOptions {
  movieId: string;
  currentDisc: number;
  isPlaying: boolean;
  getRealTime: () => number;
}

function fireProgressSave(movieId: string, seconds: number, disc?: number) {
  fetch(`/api/movies/${movieId}/user-data`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      playbackPositionSeconds: Math.floor(seconds),
      ...(disc !== undefined ? { currentDisc: disc } : {}),
    }),
  }).catch(() => {});
}

export function useProgressSave({ movieId, currentDisc, isPlaying, getRealTime }: UseProgressSaveOptions) {
  const isPlayingRef = useRef(isPlaying);
  const currentDiscRef = useRef(currentDisc);
  isPlayingRef.current = isPlaying;
  currentDiscRef.current = currentDisc;

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlayingRef.current) {
        fireProgressSave(movieId, getRealTime(), currentDiscRef.current);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [movieId, getRealTime]);

  const mutate = useCallback(
    (data: { seconds: number; disc?: number }) => fireProgressSave(movieId, data.seconds, data.disc),
    [movieId],
  );

  return { mutate };
}
