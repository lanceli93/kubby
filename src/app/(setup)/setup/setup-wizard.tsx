"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setLocale } from "@/i18n/locale";
import { Eye, EyeOff, FolderOpen, Check } from "lucide-react";
import { FolderPicker } from "@/components/library/folder-picker";

export function SetupWizard() {
  const router = useRouter();
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const tAuth = useTranslations("auth");

  const [step, setStep] = useState(1);
  const [selectedLocale, setSelectedLocale] = useState("en");

  // Step 2: Admin
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 3: Library
  const [libraryName, setLibraryName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);

  // Errors & loading
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLanguageSelect(locale: string) {
    setSelectedLocale(locale);
    await setLocale(locale);
    router.refresh();
    setStep(2);
  }

  function handleAdminNext() {
    setError("");
    if (!username.trim()) {
      setError("Username is required");
      return;
    }
    if (password.length < 1) {
      setError("Password is required");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setStep(3);
  }

  async function handleComplete(skipLibrary: boolean) {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, string> = {
        username,
        password,
        locale: selectedLocale,
      };
      if (!skipLibrary && libraryName && folderPath) {
        body.libraryName = libraryName;
        body.folderPath = folderPath;
      }

      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Setup failed");
        setLoading(false);
        return;
      }

      setStep(4);
    } catch {
      setError("Something went wrong");
    }
    setLoading(false);
  }

  function ProgressDots({ current }: { current: number }) {
    return (
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`rounded-full transition-all ${
              i === current
                ? "h-2.5 w-2.5 bg-primary"
                : i < current
                  ? "h-2 w-2 bg-primary"
                  : "h-2 w-2 bg-[#333348]"
            }`}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]">
      {/* Step 1: Language Selection */}
      {step === 1 && (
        <div className="flex w-[520px] flex-col items-center gap-7 rounded-2xl border border-white/[0.06] bg-card px-10 py-12">
          <h1 className="text-4xl font-bold text-primary">Kubby</h1>
          <h2 className="text-xl font-semibold text-foreground">
            {t("welcomeToKubby")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("selectYourLanguage")}
          </p>

          <div className="flex w-full gap-4">
            <button
              onClick={() => handleLanguageSelect("en")}
              className={`flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-2 py-8 transition-colors ${
                selectedLocale === "en"
                  ? "border-primary/50 bg-[#0f0f1a]"
                  : "border-white/[0.06] bg-[#0f0f1a] hover:border-white/[0.12]"
              }`}
            >
              <span className="text-2xl font-bold text-primary">EN</span>
              <span className="text-[15px] font-semibold text-foreground">
                English
              </span>
            </button>
            <button
              onClick={() => handleLanguageSelect("zh")}
              className={`flex flex-1 flex-col items-center justify-center gap-2.5 rounded-xl border-2 py-8 transition-colors ${
                selectedLocale === "zh"
                  ? "border-primary/50 bg-[#0f0f1a]"
                  : "border-white/[0.06] bg-[#0f0f1a] hover:border-white/[0.12]"
              }`}
            >
              <span className="text-2xl font-bold text-muted-foreground">
                中
              </span>
              <span className="text-[15px] text-muted-foreground">中文</span>
            </button>
          </div>

          <ProgressDots current={1} />
        </div>
      )}

      {/* Step 2: Create Admin */}
      {step === 2 && (
        <div className="flex w-[480px] flex-col items-center gap-6 rounded-2xl border border-white/[0.06] bg-card px-10 py-12">
          <h1 className="text-4xl font-bold text-primary">Kubby</h1>
          <h2 className="text-xl font-semibold text-foreground">
            {t("createAdminAccount")}
          </h2>

          <div className="flex w-full flex-col gap-5">
            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {tAuth("username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("enterAdminUsername")}
                className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {tAuth("password")}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("enterPassword")}
                  className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 pr-10 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
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

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {tAuth("confirmPassword")}
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("confirmYourPassword")}
                  className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 pr-10 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#555568] hover:text-muted-foreground"
                >
                  {showConfirm ? (
                    <Eye className="h-[18px] w-[18px]" />
                  ) : (
                    <EyeOff className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex w-full gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-white/[0.06] text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
            >
              {tc("back")}
            </button>
            <button
              onClick={handleAdminNext}
              className="flex h-11 flex-[2] items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {tc("next")}
            </button>
          </div>

          <ProgressDots current={2} />
        </div>
      )}

      {/* Step 3: Add Media Library */}
      {step === 3 && (
        <div className="flex w-[480px] flex-col items-center gap-6 rounded-2xl border border-white/[0.06] bg-card px-10 py-12">
          <h1 className="text-4xl font-bold text-primary">Kubby</h1>
          <h2 className="text-xl font-semibold text-foreground">
            {t("addMediaLibrary")}
          </h2>

          <div className="flex w-full flex-col gap-5">
            {/* Library Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("libraryName")}
              </label>
              <input
                type="text"
                value={libraryName}
                onChange={(e) => setLibraryName(e.target.value)}
                placeholder={t("libraryNamePlaceholder")}
                className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
              />
            </div>

            {/* Folder Path */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("folderPath")}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder={t("folderPathPlaceholder")}
                  className="h-11 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                />
                <button
                  onClick={() => setFolderPickerOpen(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] bg-[var(--input-bg)] text-primary hover:bg-white/[0.04]"
                >
                  <FolderOpen className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex w-full gap-3">
            <button
              onClick={() => setStep(2)}
              disabled={loading}
              className="flex h-11 flex-1 items-center justify-center rounded-lg border border-white/[0.06] text-[15px] font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {tc("back")}
            </button>
            <button
              onClick={() => handleComplete(false)}
              disabled={loading}
              className="flex h-11 flex-[2] items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? tc("loading") : tc("next")}
            </button>
          </div>

          <button
            onClick={() => handleComplete(true)}
            disabled={loading}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            {t("skipForNow")}
          </button>

          <ProgressDots current={3} />

          <FolderPicker
            open={folderPickerOpen}
            onOpenChange={setFolderPickerOpen}
            onSelect={(path) => setFolderPath(path)}
          />
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && (
        <div className="flex w-[480px] flex-col items-center gap-7 rounded-2xl border border-white/[0.06] bg-card px-10 py-12">
          <h1 className="text-4xl font-bold text-primary">Kubby</h1>

          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-green-500/10">
            <Check className="h-9 w-9 text-green-500" />
          </div>

          <h2 className="text-2xl font-bold text-foreground">
            {t("youreAllSet")}
          </h2>
          <p className="w-[320px] text-center text-sm text-muted-foreground">
            {t("setupCompleteDesc")}
          </p>

          <button
            onClick={() => router.push("/login")}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("goToSignIn")}
          </button>

          <ProgressDots current={4} />
        </div>
      )}
    </div>
  );
}
