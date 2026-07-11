"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Upload, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { GlassToast } from "@/components/ui/glass-toast";
import { useScanActions } from "@/providers/scan-provider";

interface Library {
  id: string;
  name: string;
  type: string;
}

/**
 * Upload audio files into a music library from the browser. Admin-only. When
 * more than one music library exists it first asks which to upload into
 * (dropdown); with exactly one it uploads straight away. After the files land
 * on disk it kicks off a library scan so the tracks appear.
 */
export function MusicUploadButton({ activeLibraryId }: { activeLibraryId?: string }) {
  const t = useTranslations("music");
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const { startScan } = useScanActions();

  const { data: libraries = [] } = useQuery<Library[]>({
    queryKey: ["libraries"],
    queryFn: () => fetch("/api/libraries").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);

  const musicLibraries = libraries.filter((l) => l.type === "music");
  if (!isAdmin || musicLibraries.length === 0) return null;

  const showToast = (text: string, success: boolean) => {
    setToast({ text, success });
    setTimeout(() => setToast(null), 2500);
  };

  const pickFor = (libraryId: string) => {
    targetRef.current = libraryId;
    inputRef.current?.click();
  };

  // Default target: the active/filtered library, else the first music library.
  const soleTarget =
    activeLibraryId && musicLibraries.some((l) => l.id === activeLibraryId)
      ? activeLibraryId
      : musicLibraries.length === 1
        ? musicLibraries[0].id
        : null;

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const libraryId = targetRef.current;
    e.target.value = ""; // reset so the same file can be re-picked
    if (!files || files.length === 0 || !libraryId) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("libraryId", libraryId);
      for (const file of Array.from(files)) fd.append("files", file);

      const res = await fetch("/api/music/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as { saved: string[] };

      showToast(t("uploadDone"), true);
      // Ingest the new files.
      if (data.saved.length > 0) startScan(libraryId);
    } catch {
      showToast(t("uploadFailed"), false);
    } finally {
      setUploading(false);
    }
  };

  const triggerClass =
    "focus-ring glass-btn flex items-center gap-2 rounded-full px-4 py-2 text-sm text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer disabled:opacity-50";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.flac,.m4a,.aac,.ogg,.opus,.wav,.wma,.aiff,.aif,.alac,audio/*"
        multiple
        hidden
        onChange={handleFiles}
      />

      {soleTarget ? (
        <button className={triggerClass} disabled={uploading} onClick={() => pickFor(soleTarget)}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? t("uploading") : t("upload")}
        </button>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={triggerClass} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? t("uploading") : t("upload")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 border-white/10 bg-black/70 backdrop-blur-xl">
            <DropdownMenuLabel className="text-xs text-muted-foreground">{t("uploadTo")}</DropdownMenuLabel>
            {musicLibraries.map((lib) => (
              <DropdownMenuItem key={lib.id} onClick={() => pickFor(lib.id)}>
                {lib.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <GlassToast visible={!!toast} success={toast?.success} className="z-[100]">
        {toast?.text}
      </GlassToast>
    </>
  );
}
