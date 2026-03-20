"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle, Monitor } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PLAYER_PRESETS: Record<string, { platform: "mac" | "win"; macPath?: string; winPath?: string; label: string; icon: string }> = {
  IINA: { platform: "mac", macPath: "/Applications/IINA.app", label: "macOS", icon: "/icons/iina.png" },
  PotPlayer: { platform: "win", winPath: "C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe", label: "Windows", icon: "/icons/potplayer.png" },
};

export default function PlaybackPreferencesPage() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const queryClient = useQueryClient();
  const { data: prefs } = useUserPreferences();
  const [playbackSaving, setPlaybackSaving] = useState(false);
  const [playbackToast, setPlaybackToast] = useState<{ text: string; success: boolean } | null>(null);
  const playbackToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showPlaybackToast(text: string, success: boolean) {
    clearTimeout(playbackToastTimer.current);
    setPlaybackToast({ text, success });
    playbackToastTimer.current = setTimeout(() => setPlaybackToast(null), 2500);
  }
  const [playerName, setPlayerName] = useState<string>("");
  const [playerPath, setPlayerPath] = useState("");
  const [playerMode, setPlayerMode] = useState<string>("local");
  const [isLocalhost, setIsLocalhost] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === "localhost" || host === "127.0.0.1" || host === "::1");
  }, []);

  const clientIsMac = typeof navigator !== "undefined" &&
    (navigator.platform?.toLowerCase().includes("mac") || navigator.userAgent?.toLowerCase().includes("mac"));
  const serverIsMac = prefs?.serverPlatform === "darwin";

  function getEffectivePlatform(mode: string): "mac" | "win" {
    return (mode === "local" ? serverIsMac : clientIsMac) ? "mac" : "win";
  }

  useEffect(() => {
    if (prefs) {
      const savedMode = prefs.externalPlayerMode || "local";
      const effectiveMode = !isLocalhost && savedMode === "local" ? "stream" : savedMode;
      setPlayerMode(effectiveMode);
      setPlayerPath(prefs.externalPlayerPath || "");

      const savedName = prefs.externalPlayerName || "";
      if (savedName && !isPlayerCompatible(savedName, effectiveMode)) {
        setPlayerName("");
      } else {
        setPlayerName(savedName);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, isLocalhost]);

  function handlePlayerChange(name: string) {
    setPlayerName(name);
    if (name && PLAYER_PRESETS[name]) {
      const preset = PLAYER_PRESETS[name];
      const isMac = getEffectivePlatform(playerMode) === "mac";
      setPlayerPath((isMac ? preset.macPath : preset.winPath) || "");
    } else {
      setPlayerPath("");
    }
  }

  function isPlayerCompatible(name: string, mode: string) {
    const preset = PLAYER_PRESETS[name];
    if (!preset) return false;
    return preset.platform === getEffectivePlatform(mode);
  }

  function handleModeChange(mode: string) {
    setPlayerMode(mode);
    if (playerName && !isPlayerCompatible(playerName, mode)) {
      setPlayerName("");
      setPlayerPath("");
    }
  }

  async function handlePlaybackSave() {
    setPlaybackSaving(true);
    try {
      const res = await fetch("/api/settings/personal-metadata", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalPlayerEnabled: !!playerName,
          externalPlayerName: playerName || null,
          externalPlayerPath: playerPath || null,
          externalPlayerMode: playerMode,
        }),
      });
      if (res.ok) {
        showPlaybackToast(t("playbackSettingsSaved"), true);
        queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      } else {
        showPlaybackToast(t("failedToSave"), false);
      }
    } catch {
      showPlaybackToast(t("somethingWentWrong"), false);
    } finally {
      setPlaybackSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("playback")}</h1>

      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <p className="text-sm text-muted-foreground">{t("externalPlayerDesc")}</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("playerName")}
          </label>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => handlePlayerChange("")}
              className={`flex h-11 w-80 items-center gap-3 rounded-lg border px-3.5 text-sm transition-fluid cursor-pointer ${
                !playerName
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-white/[0.06] bg-white/[0.05] text-muted-foreground hover:bg-white/5"
              }`}
            >
              <Monitor className="h-5 w-5 flex-shrink-0 opacity-50" />
              <span>None</span>
              <span className="text-xs text-muted-foreground">(Web Player)</span>
            </button>
            {Object.entries(PLAYER_PRESETS).map(([name, preset]) => {
              const disabled = !isPlayerCompatible(name, playerMode);
              const selected = playerName === name;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePlayerChange(name)}
                  className={`flex h-11 w-80 items-center gap-3 rounded-lg border px-3.5 text-sm transition-fluid ${
                    disabled
                      ? "border-white/[0.03] bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed opacity-40"
                      : selected
                        ? "border-primary bg-primary/10 text-foreground cursor-pointer"
                        : "border-white/[0.06] bg-white/[0.05] text-foreground hover:bg-white/5 cursor-pointer"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preset.icon} alt={name} className="h-5 w-5 flex-shrink-0 rounded" />
                  <span>{name}</span>
                  <span className="text-xs text-muted-foreground">({preset.label})</span>
                </button>
              );
            })}
          </div>
        </div>
        {playerName && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-muted-foreground">
              {t("playerMode")}
            </label>
            <Select value={playerMode} onValueChange={handleModeChange}>
              <SelectTrigger className="h-11 w-64 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local" disabled={!isLocalhost}>{t("playerModeLocal")}</SelectItem>
                <SelectItem value="stream">{t("playerModeStream")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {playerMode === "local" ? t("playerModeLocalDesc") : t("playerModeStreamDesc")}
            </p>
          </div>
        )}
        {playerName && playerMode === "local" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-muted-foreground">
              {t("playerPath")}
            </label>
            <input
              type="text"
              value={playerPath}
              onChange={(e) => setPlayerPath(e.target.value)}
              className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="/Applications/IINA.app"
            />
          </div>
        )}
        {playerName && (
          <>
            <p className="text-xs text-yellow-500/80">
              {t("externalPlayerWarning")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("externalPlayerToggleHint")}
            </p>
          </>
        )}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handlePlaybackSave}
            disabled={playbackSaving}
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {tCommon("save")}
          </button>
        </div>
      </div>

      {/* Toast */}
      <div
        className={`fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-300 ${
          playbackToast
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0 pointer-events-none"
        } ${
          playbackToast?.success
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}
      >
        {playbackToast?.success ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        {playbackToast?.text}
      </div>
    </div>
    </div>
  );
}
