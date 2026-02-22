"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/locale";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useQueryClient } from "@tanstack/react-query";
import { Check, AlertCircle } from "lucide-react";

const PLAYER_PRESETS: Record<string, { platform: "mac" | "win" | "all"; macPath?: string; winPath?: string; label?: string }> = {
  IINA: { platform: "mac", macPath: "/Applications/IINA.app", label: "macOS" },
  VLC: { platform: "all", macPath: "/Applications/VLC.app", winPath: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" },
  PotPlayer: { platform: "win", winPath: "C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe", label: "Windows" },
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const t = useTranslations("settings");
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: prefs } = useUserPreferences();
  const [displayName, setDisplayName] = useState(session?.user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
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
  const locale = useLocale();

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === "localhost" || host === "127.0.0.1" || host === "::1");
  }, []);

  const clientIsMac = typeof navigator !== "undefined" &&
    (navigator.platform?.toLowerCase().includes("mac") || navigator.userAgent?.toLowerCase().includes("mac"));
  const serverIsMac = prefs?.serverPlatform === "darwin";

  // Which platform determines available players: local → server, stream → client
  function getEffectivePlatform(mode: string): "mac" | "win" {
    return (mode === "local" ? serverIsMac : clientIsMac) ? "mac" : "win";
  }

  useEffect(() => {
    if (prefs) {
      const savedMode = prefs.externalPlayerMode || "local";
      const effectiveMode = !isLocalhost && savedMode === "local" ? "stream" : savedMode;
      setPlayerMode(effectiveMode);
      setPlayerPath(prefs.externalPlayerPath || "");

      // Validate saved player is available on the effective platform
      const savedName = prefs.externalPlayerName || "";
      const platform = getEffectivePlatform(effectiveMode);
      if (savedName && PLAYER_PRESETS[savedName]?.platform !== platform) {
        setPlayerName(""); // Reset if player doesn't match platform
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
    if (preset.platform === "all") return true;
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

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg("");
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      });
      if (res.ok) setProfileMsg(t("changesSaved"));
      else setProfileMsg(t("failedToSave"));
    } catch {
      setProfileMsg(t("somethingWentWrong"));
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg("");
    if (newPassword !== confirmPassword) {
      setPasswordMsg(t("passwordsDoNotMatch"));
      return;
    }
    try {
      const res = await fetch("/api/users/me/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordMsg(t("passwordUpdated"));
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        setPasswordMsg(data.error || t("failedToUpdatePassword"));
      }
    } catch {
      setPasswordMsg(t("somethingWentWrong"));
    }
  }

  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <div className="h-full overflow-y-scroll">
    <div className="flex flex-col items-center gap-6 py-8">
      <h1 className="text-2xl font-bold text-foreground">{t("settings")}</h1>

      {/* Profile */}
      <form
        onSubmit={handleProfileSave}
        className="flex w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7"
      >
        <h2 className="text-lg font-semibold text-foreground">{t("profile")}</h2>
        <div className="flex items-center gap-4">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
            {initials}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {session?.user?.email}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("displayName")}
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("username")}
          </label>
          <p className="text-sm text-[#666680]">{session?.user?.email}</p>
        </div>
        {profileMsg && (
          <p className="text-sm text-primary">{profileMsg}</p>
        )}
        <button
          type="submit"
          className="w-fit rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("saveChanges")}
        </button>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handlePasswordChange}
        className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7"
      >
        <h2 className="text-lg font-semibold text-foreground">
          {t("changePassword")}
        </h2>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("currentPassword")}
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("newPassword")}
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("confirmNewPassword")}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        {passwordMsg && (
          <p className={`text-sm ${passwordMsg === t("passwordUpdated") ? "text-green-500" : "text-destructive"}`}>
            {passwordMsg}
          </p>
        )}
        <button
          type="submit"
          className="w-fit rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("updatePassword")}
        </button>
      </form>

      {/* Language */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">{t("language")}</h2>
        <p className="text-sm text-muted-foreground">{t("languageDesc")}</p>
        <select
          value={locale}
          style={{ colorScheme: "dark" }}
          onChange={async (e) => {
            const newLocale = e.target.value;
            await setLocale(newLocale);
            await fetch("/api/users/me", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale: newLocale }),
            });
            router.refresh();
          }}
          className="h-11 w-48 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>

      {/* Playback */}
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">{t("playback")}</h2>
        <p className="text-sm text-muted-foreground">{t("externalPlayerDesc")}</p>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("playerName")}
          </label>
          <select
            value={playerName}
            style={{ colorScheme: "dark" }}
            onChange={(e) => handlePlayerChange(e.target.value)}
            className="h-11 w-64 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
          >
            <option value="">{t("playerNone")}</option>
            {Object.entries(PLAYER_PRESETS).map(([name, preset]) => {
              const disabled = !isPlayerCompatible(name, playerMode);
              const suffix = preset.label ? ` (${preset.label})` : "";
              return (
                <option key={name} value={name} disabled={disabled}>
                  {name}{suffix}
                </option>
              );
            })}
          </select>
        </div>
        {playerName && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-muted-foreground">
              {t("playerMode")}
            </label>
            <select
              value={playerMode}
              style={{ colorScheme: "dark" }}
              onChange={(e) => handleModeChange(e.target.value)}
              className="h-11 w-64 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="local" disabled={!isLocalhost}>{t("playerModeLocal")}</option>
              <option value="stream">{t("playerModeStream")}</option>
            </select>
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
              className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
              placeholder="/Applications/IINA.app"
            />
          </div>
        )}
        {playerName && (
          <p className="text-xs text-yellow-500/80">
            {t("externalPlayerWarning")}
          </p>
        )}
        <button
          type="button"
          onClick={handlePlaybackSave}
          disabled={playbackSaving}
          className="w-fit rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {playbackSaving ? t("saving") : t("savePlaybackSettings")}
        </button>
      </div>

      {/* Account Info */}
      <div className="flex w-[720px] flex-col gap-3 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-7">
        <h2 className="text-lg font-semibold text-foreground">{t("accountInfo")}</h2>
        <div className="flex gap-2 text-sm">
          <span className="text-[#666680]">{t("accountType")}:</span>
          <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
            session?.user?.isAdmin ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground"
          }`}>
            {session?.user?.isAdmin ? t("administrator") : t("user")}
          </span>
        </div>
      </div>
    </div>

      {/* Playback toast */}
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
  );
}
