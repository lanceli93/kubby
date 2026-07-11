"use client";

import Image from "next/image";
import { Music } from "lucide-react";
import { resolveImageSrc } from "@/lib/image-utils";

interface VinylDiscProps {
  cover?: string | null; // relative image path
  coverBlur?: string | null; // base64 blur data URL
  title: string; // for alt text
  isPlaying: boolean;
  className?: string; // sizing, e.g. "w-full max-w-[360px] aspect-square"
}

/**
 * VinylDisc — a simple dark vinyl record for the Now Playing overlay (NOT a
 * skeuomorphic turntable: no base, no tonearm). A grooved black disc carries a
 * circular album-cover "label" with a center spindle hole. The whole disc
 * rotates via `.music-vinyl-spin` (globals.css); the spin freezes on pause via
 * inline `animationPlayState`. Sizing comes entirely from `className`.
 */
export function VinylDisc({ cover, coverBlur, title, isPlaying, className }: VinylDiscProps) {
  return (
    <div
      className={`relative aspect-square rounded-full ${className ?? ""}`}
      style={{ filter: "drop-shadow(0 24px 60px rgba(0,0,0,0.6))" }}
    >
      {/* Rotating wrapper — grooves + label spin together. Frozen on pause. */}
      <div
        className="music-vinyl-spin absolute inset-0 rounded-full"
        style={{ animationPlayState: isPlaying ? "running" : "paused" }}
      >
        {/* Grooved disc: concentric rings over a near-black base, a soft radial
            sheen highlight, and a faint outer ring so it reads as physical. */}
        <div
          className="absolute inset-0 rounded-full ring-1 ring-white/[0.06]"
          style={{
            backgroundImage: [
              "radial-gradient(circle at 32% 28%, rgba(255,255,255,0.08), transparent 45%)",
              "repeating-radial-gradient(circle at center, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px)",
              "radial-gradient(circle at center, #17171c 0%, #0d0d10 70%)",
            ].join(", "),
          }}
        />

        {/* Center label — circular album cover. Sized large (~64% of the disc
            diameter) so the cover dominates and the black groove ring stays
            thin, per design feedback that the vinyl was too heavy. */}
        <div className="absolute left-1/2 top-1/2 aspect-square w-[64%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[var(--surface)] ring-1 ring-black/40">
          {cover ? (
            <Image
              src={resolveImageSrc(cover, 360)}
              alt={title}
              fill
              className="object-cover"
              sizes="180px"
              {...(coverBlur ? { placeholder: "blur" as const, blurDataURL: coverBlur } : {})}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Music className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        {/* Spindle hole — a small dark dot with a faint ring over the label. */}
        <div className="absolute left-1/2 top-1/2 aspect-square w-[4.5%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#07070b] ring-1 ring-white/10" />
      </div>
    </div>
  );
}
