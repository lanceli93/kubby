"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/locale";

export default function SettingsPage() {
  const { data: session } = useSession();
  const t = useTranslations("settings");
  const router = useRouter();
  const [displayName, setDisplayName] = useState(session?.user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");
  const locale = useLocale();

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
        className="flex w-[720px] flex-col gap-5 rounded-xl border border-white/[0.03] bg-card p-7"
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
        className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.03] bg-card p-7"
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
      <div className="flex w-[720px] flex-col gap-4 rounded-xl border border-white/[0.03] bg-card p-7">
        <h2 className="text-lg font-semibold text-foreground">{t("language")}</h2>
        <p className="text-sm text-muted-foreground">{t("languageDesc")}</p>
        <select
          value={locale}
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

      {/* Account Info */}
      <div className="flex w-[720px] flex-col gap-3 rounded-xl border border-white/[0.03] bg-card p-7">
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
