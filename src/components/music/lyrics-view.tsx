"use client";

import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, Music } from "lucide-react";

interface LyricsResponse {
  lyrics: string | null;
  synced: boolean;
}

interface LyricLine {
  time: number | null; // seconds; null for plain (unsynced) lines
  text: string;
}

/**
 * Parse an LRC document into timed lines. A line may carry multiple timestamps
 * (`[00:01.00][00:05.00]words`) — each yields its own entry. Lines with no
 * timestamp are kept as plain text (time = null). Sorted by time.
 */
function parseLrc(text: string): { lines: LyricLine[]; synced: boolean } {
  const stampRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const out: LyricLine[] = [];
  let anyTimed = false;

  for (const raw of text.split(/\r?\n/)) {
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    stampRe.lastIndex = 0;
    while ((m = stampRe.exec(raw)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const fracStr = m[3] ?? "";
      // Normalise fractional part to a 0–1 second fraction (2 or 3 digits).
      const frac = fracStr ? parseInt(fracStr, 10) / Math.pow(10, fracStr.length) : 0;
      stamps.push(min * 60 + sec + frac);
    }
    const content = raw.replace(stampRe, "").trim();
    if (stamps.length > 0) {
      anyTimed = true;
      for (const time of stamps) out.push({ time, text: content });
    } else if (content) {
      out.push({ time: null, text: content });
    }
  }

  if (anyTimed) {
    out.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity));
  }
  return { lines: out, synced: anyTimed };
}

/**
 * Lyrics panel for the Now Playing overlay. Fetches lyrics for `trackId`; when
 * synced (LRC), highlights + auto-scrolls the active line to `currentTime`.
 * Plain lyrics render as a centered scrollable block.
 */
export function LyricsView({
  trackId,
  currentTime,
}: {
  trackId: string;
  currentTime: number;
}) {
  const t = useTranslations("music");
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  const { data, isLoading } = useQuery<LyricsResponse>({
    queryKey: ["music-lyrics", trackId],
    queryFn: () => fetch(`/api/music/tracks/${trackId}/lyrics`).then((r) => r.json()),
    staleTime: 60 * 60 * 1000,
  });

  const parsed = useMemo(
    () => (data?.lyrics ? parseLrc(data.lyrics) : { lines: [], synced: false }),
    [data]
  );

  // Index of the current active line for synced lyrics.
  const activeIndex = useMemo(() => {
    if (!parsed.synced) return -1;
    let idx = -1;
    for (let i = 0; i < parsed.lines.length; i++) {
      const time = parsed.lines[i].time;
      if (time != null && time <= currentTime + 0.15) idx = i;
      else if (time != null && time > currentTime) break;
    }
    return idx;
  }, [parsed, currentTime]);

  // Keep the active line centered.
  useEffect(() => {
    if (activeIndex < 0 || !activeRef.current) return;
    activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!data?.lyrics || parsed.lines.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <Music className="h-10 w-10 opacity-40" />
        <p className="text-sm">{t("noLyrics")}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full overflow-y-auto px-2 py-8 md:px-6">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        {parsed.lines.map((line, i) => {
          const isActive = parsed.synced && i === activeIndex;
          const isPast = parsed.synced && activeIndex >= 0 && i < activeIndex;
          return (
            <p
              key={i}
              ref={isActive ? activeRef : undefined}
              className={`text-center text-lg leading-relaxed transition-all duration-300 md:text-xl ${
                isActive
                  ? "scale-[1.03] font-semibold text-foreground"
                  : isPast
                    ? "text-muted-foreground/40"
                    : parsed.synced
                      ? "text-muted-foreground/70"
                      : "text-foreground/90"
              }`}
            >
              {line.text || " "}
            </p>
          );
        })}
      </div>
    </div>
  );
}
