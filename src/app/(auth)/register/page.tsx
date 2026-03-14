"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError(t("passwordsDoNotMatch"));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, displayName, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("registrationFailed"));
        setLoading(false);
        return;
      }

      router.push("/login");
    } catch {
      setError(t("somethingWentWrong"));
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]">
      <div className="w-full max-w-[480px] mx-4 md:mx-0 animate-fade-in-up rounded-2xl border border-white/[0.06] glass-cinema p-6 md:p-10">
        <div className="flex flex-col items-center gap-5">
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
          <p className="text-[15px] text-muted-foreground">
            {t("createYourAccount")}
          </p>

          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("enterUsername")}
                className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("displayNameOptional")}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t("displayName")}
                className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("password")}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("enterPassword")}
                className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("confirmPassword")}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("enterPassword")}
                className="h-11 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 active:scale-95 cursor-pointer disabled:opacity-50"
            >
              {loading ? t("creating") : t("createAccount")}
            </button>
          </form>

          <div className="flex items-center gap-1">
            <span className="text-[13px] text-[#666680]">
              {t("alreadyHaveAccount")}
            </span>
            <Link
              href="/login"
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              {t("signIn")}
            </Link>
          </div>

          <p className="w-[300px] text-center text-xs text-[#444460]">
            {t("firstUserAdmin")}
          </p>
        </div>
      </div>
    </div>
  );
}
