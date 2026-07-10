"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Placeholder lightbox for a single photo/video. The full lightbox (zoom,
// swipe navigation, EXIF panel, inline video playback — see
// docs/photos-library-design.md §7) lands in T6; this just shows the large
// image full-screen so the click-through and /file route can be verified.
export default function PhotoViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <button
        type="button"
        onClick={() => router.push("/photos")}
        aria-label="Back"
        className="absolute left-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photos/${id}/file`}
        alt=""
        className="max-h-full max-w-full object-contain"
      />
    </div>
  );
}
