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
 * synced (LRC), highlights the active line and keeps it vertically centered by
 * scrolling ITS OWN container only (never `scrollIntoView`, which would bubble
 * up and drag the whole overlay). Clicking a timed line seeks to it. Plain
 * lyrics render as a centered scrollable block. The container is bounded and
 * self-scrolling, with gradient fade masks top and bottom.
 */
export function LyricsView({
  trackId,
  currentTime,
  onSeek,
  align = "center",
}: {
  trackId: string;
  currentTime: number;
  onSeek?: (seconds: number) => void;
  align?: "center" | "left";
}) {
  const t = useTranslations("music");
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Keep the active line centered — scrolling ONLY the lyrics container. We
  // compute the delta from bounding rects and call scrollTo on our own element,
  // so no scrollable ancestor (the overlay) is ever touched. This is the fix
  // for "the whole page drifts down as the song plays".
  useEffect(() => {
    const container = scrollRef.current;
    const active = activeRef.current;
    if (!parsed.synced || activeIndex < 0 || !container || !active) return;
    const cRect = container.getBoundingClientRect();
    const aRect = active.getBoundingClientRect();
    const delta =
      aRect.top - cRect.top - (container.clientHeight / 2 - active.clientHeight / 2);
    container.scrollTo({ top: container.scrollTop + delta, behavior: "smooth" });
  }, [activeIndex, parsed.synced]);

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
    <div
      ref={scrollRef}
      className="music-lyrics-scroll h-full overflow-y-auto overflow-x-hidden"
    >
      {/* Top/bottom padding lets the first & last lines reach the vertical
          centre; the container clips and fades them (mask in globals.css). */}
      <div
        className={`flex max-w-lg flex-col gap-5 px-2 pb-[45vh] pt-[16vh] md:px-6 md:gap-6 ${
          align === "left" ? "mr-auto items-start" : "mx-auto"
        }`}
      >
        {parsed.lines.map((line, i) => {
          const isActive = parsed.synced && i === activeIndex;
          const isPast = parsed.synced && activeIndex >= 0 && i < activeIndex;
          const clickable = parsed.synced && line.time != null && !!onSeek;
          return (
            <p
              key={i}
              ref={isActive ? activeRef : undefined}
              onClick={clickable ? () => onSeek!(line.time!) : undefined}
              className={`text-lg leading-relaxed transition-all duration-300 md:text-xl ${
                align === "left" ? "text-left" : "text-center"
              } ${clickable ? "cursor-pointer" : ""} ${
                isActive
                  ? "font-semibold text-foreground md:scale-[1.04]"
                  : isPast
                    ? "text-muted-foreground/35 hover:text-muted-foreground/60"
                    : parsed.synced
                      ? "text-muted-foreground/55 hover:text-muted-foreground/80"
                      : "text-foreground/85"
              }`}
            >
              {line.text || " "}
            </p>
          );
        })}
      </div>
    </div>
  );
}
