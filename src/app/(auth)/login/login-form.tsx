"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { setLocale } from "@/i18n/locale";

export function LoginForm() {
  return (
    <Suspense>
      <LoginFormInner />
    </Suspense>
  );
}

function LoginFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sanitize callbackUrl to pathname only — middleware may set absolute URL with 0.0.0.0 host
  const rawCallbackUrl = searchParams.get("callbackUrl") || "/";
  const callbackUrl = (() => {
    try {
      const url = new URL(rawCallbackUrl, window.location.origin);
      return url.pathname + url.search + url.hash;
    } catch {
      return "/";
    }
  })();
  const t = useTranslations("auth");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t("invalidCredentials"));
    } else {
      // Restore user's locale preference after login
      try {
        const meRes = await fetch("/api/users/me");
        if (meRes.ok) {
          const userData = await meRes.json();
          if (userData.locale) {
            await setLocale(userData.locale);
          }
        }
      } catch {
        // Ignore locale restore errors
      }
      router.push(callbackUrl);
      router.refresh();
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]">
      <div className="w-[480px] animate-fade-in-up rounded-2xl border border-white/[0.06] bg-card px-10 py-12">
        <div className="flex flex-col items-center gap-6">
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
          <p className="text-[15px] text-muted-foreground">
            {t("signInToAccount")}
          </p>

          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("enterUsername")}
                className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("enterPassword")}
                  className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 pr-10 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#555568] hover:text-muted-foreground"
                >
                  {showPassword ? (
                    <Eye className="h-[18px] w-[18px]" />
                  ) : (
                    <EyeOff className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? t("signingIn") : t("signIn")}
            </button>
          </form>

          <div className="flex items-center gap-1">
            <span className="text-[13px] text-[#666680]">
              {t("dontHaveAccount")}
            </span>
            <Link
              href="/register"
              className="text-[13px] font-semibold text-primary hover:underline"
            >
              {t("register")}
            </Link>
          </div>

          <p className="text-xs text-[#444460]">Kubby Media Server</p>
        </div>
      </div>
    </div>
  );
}
