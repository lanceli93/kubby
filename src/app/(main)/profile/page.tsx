"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function ProfilePage() {
  const { data: session } = useSession();
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [displayName, setDisplayName] = useState(session?.user?.name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState("");

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
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("profile")}</h1>

      {/* Profile */}
      <form
        onSubmit={handleProfileSave}
        className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7"
      >
        <div className="flex items-center gap-5">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground shadow-[0_0_24px_rgba(59,130,246,0.2)]">
            {initials}
            <div className="absolute inset-0 rounded-full ring-2 ring-primary/20" />
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
            className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
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
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {tCommon("save")}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form
        onSubmit={handlePasswordChange}
        className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
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
            className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
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
            className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
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
            className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
            required
          />
        </div>
        {passwordMsg && (
          <p className={`text-sm ${passwordMsg === t("passwordUpdated") ? "text-green-500" : "text-destructive"}`}>
            {passwordMsg}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {tCommon("save")}
          </button>
        </div>
      </form>

      {/* Account Info */}
      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("accountInfo")}</h2>
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
