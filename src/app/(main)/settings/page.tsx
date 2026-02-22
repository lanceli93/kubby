"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/locale";
import { useUserPreferences } from "@/hooks/use-user-preferences";
import { useQueryClient } from "@tanstack/react-query";

const PLAYER_PRESETS: Record<string, { mac?: string; win?: string }> = {
  IINA: { mac: "/Applications/IINA.app" },
  VLC: { mac: "/Applications/VLC.app", win: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" },
  PotPlayer: { win: "C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe" },
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
  const [playbackMsg, setPlaybackMsg] = useState("");
  const [playerName, setPlayerName] = useState<string>("");
  const [playerPath, setPlayerPath] = useState("");
  const [playerMode, setPlayerMode] = useState<string>("local");
  const locale = useLocale();

  useEffect(() => {
    if (prefs) {
      setPlayerName(prefs.externalPlayerName || "");
      setPlayerPath(prefs.externalPlayerPath || "");
      setPlayerMode(prefs.externalPlayerMode || "local");
    }
  }, [prefs]);

  function handlePlayerChange(name: string) {
    setPlayerName(name);
    if (name && name !== "Custom" && PLAYER_PRESETS[name]) {
      const preset = PLAYER_PRESETS[name];
      const isMac = navigator.platform?.toLowerCase().includes("mac") ||
        navigator.userAgent?.toLowerCase().includes("mac");
      setPlayerPath((isMac ? preset.mac : preset.win) || "");
    } else if (!name) {
      setPlayerPath("");
    }
  }

  async function handlePlaybackSave() {
    setPlaybackMsg("");
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
        setPlaybackMsg(t("playbackSettingsSaved"));
        queryClient.invalidateQueries({ queryKey: ["userPreferences"] });
      } else {
        setPlaybackMsg(t("failedToSave"));
      }
    } catch {
      setPlaybackMsg(t("somethingWentWrong"));
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
            <option value="IINA">IINA</option>
            <option value="VLC">VLC</option>
            <option value="PotPlayer">PotPlayer</option>
            <option value="Custom">{t("playerCustom")}</option>
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
              onChange={(e) => setPlayerMode(e.target.value)}
              className="h-11 w-64 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            >
              <option value="local">{t("playerModeLocal")}</option>
              <option value="stream">{t("playerModeStream")}</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {playerMode === "local" ? t("playerModeLocalDesc") : t("playerModeStreamDesc")}
            </p>
          </div>
        )}
        {playerName && (
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
        {playbackMsg && (
          <p className={`text-sm ${playbackMsg === t("playbackSettingsSaved") ? "text-green-500" : "text-destructive"}`}>
            {playbackMsg}
          </p>
        )}
        <button
          type="button"
          onClick={handlePlaybackSave}
          className="w-fit rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("savePlaybackSettings")}
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
    </div>
  );
}
