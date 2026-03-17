"use client";

import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";

interface UseProgressSaveOptions {
  movieId: string;
  currentDisc: number;
  isPlaying: boolean;
  getRealTime: () => number;
}

export function useProgressSave({ movieId, currentDisc, isPlaying, getRealTime }: UseProgressSaveOptions) {
  const saveProgress = useMutation({
    mutationFn: (data: { seconds: number; disc?: number }) =>
      fetch(`/api/movies/${movieId}/user-data`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playbackPositionSeconds: Math.floor(data.seconds),
          ...(data.disc !== undefined ? { currentDisc: data.disc } : {}),
        }),
      }),
  });

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying) {
        saveProgress.mutate({ seconds: getRealTime(), disc: currentDisc });
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [isPlaying, movieId, currentDisc, saveProgress, getRealTime]);

  return saveProgress;
}
