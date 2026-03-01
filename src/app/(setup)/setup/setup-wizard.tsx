"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { setLocale } from "@/i18n/locale";
import { Eye, EyeOff, FolderOpen, Check, X, Plus, Folder } from "lucide-react";
import { FolderPicker } from "@/components/library/folder-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function SetupWizard() {
  const router = useRouter();
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const tAuth = useTranslations("auth");

  const [step, setStep] = useState(1);
  const [slideDir, setSlideDir] = useState<"right" | "left">("right");
  const [selectedLocale, setSelectedLocale] = useState("en");

  // Step 2: Admin
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Step 3: Library
  const [libraryName, setLibraryName] = useState("");
  const [libraryType, setLibraryType] = useState("movie");
  const [folderPaths, setFolderPaths] = useState<string[]>([]);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [jellyfinCompat, setJellyfinCompat] = useState(false);
  const [jellyfinCompatConfirmOpen, setJellyfinCompatConfirmOpen] = useState(false);
  const [scraperEnabled, setScraperEnabled] = useState(false);
  const [tmdbApiKey, setTmdbApiKey] = useState("");
  const [tmdbApiKeyError, setTmdbApiKeyError] = useState("");

  // Errors & loading
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLanguageSelect(locale: string) {
    setSelectedLocale(locale);
    await setLocale(locale);
    router.refresh();
  }

  function handleLanguageNext() {
    setSlideDir("right");
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
    setSlideDir("right");
    setStep(3);
  }

  async function handleComplete(skipLibrary: boolean) {
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        username,
        password,
        locale: selectedLocale,
      };
      // Auto-include any pending folder path that wasn't explicitly added
      const allPaths = newFolderPath.trim()
        ? [...folderPaths, newFolderPath.trim()]
        : folderPaths;
      if (!skipLibrary && allPaths.length > 0) {
        if (!libraryName.trim()) {
          setError(t("libraryNameRequired"));
          setLoading(false);
          return;
        }
        if (scraperEnabled && !tmdbApiKey.trim()) {
          setError(t("tmdbApiKeyRequired"));
          setLoading(false);
          return;
        }
        body.libraryName = libraryName.trim();
        body.libraryType = libraryType;
        body.folderPaths = allPaths;
        body.jellyfinCompat = jellyfinCompat;
        body.scraperEnabled = scraperEnabled;
        if (scraperEnabled && tmdbApiKey.trim()) {
          body.tmdbApiKey = tmdbApiKey.trim();
        }
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

  function ProgressSteps({ current }: { current: number }) {
    return (
      <div className="flex items-center gap-0">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300 ${
                i === current
                  ? "bg-primary text-primary-foreground shadow-[0_0_12px_rgba(59,130,246,0.4)]"
                  : i < current
                    ? "bg-primary/20 text-primary"
                    : "bg-[#222238] text-[#555568]"
              }`}
            >
              {i < current ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                i
              )}
            </div>
            {i < 4 && (
              <div
                className={`h-px w-8 transition-colors duration-300 ${
                  i < current ? "bg-primary/30" : "bg-[#222238]"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]">
      {/* Step 1: Language Selection */}
      {step === 1 && (
        <div key="step1" className={`flex w-[520px] flex-col items-center gap-7 rounded-2xl border border-white/[0.06] bg-card px-10 py-12 ${slideDir === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
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
              <span className={`text-2xl font-bold ${selectedLocale === "en" ? "text-primary" : "text-muted-foreground"}`}>EN</span>
              <span className={`text-[15px] ${selectedLocale === "en" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
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
              <span className={`text-2xl font-bold ${selectedLocale === "zh" ? "text-primary" : "text-muted-foreground"}`}>中</span>
              <span className={`text-[15px] ${selectedLocale === "zh" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>中文</span>
            </button>
          </div>

          <button
            onClick={handleLanguageNext}
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {tc("next")}
          </button>

          <ProgressSteps current={1} />
        </div>
      )}

      {/* Step 2: Create Admin */}
      {step === 2 && (
        <div key="step2" className={`flex w-[480px] flex-col items-center gap-6 rounded-2xl border border-white/[0.06] bg-card px-10 py-12 ${slideDir === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
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
              onClick={() => { setSlideDir("left"); setStep(1); }}
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

          <ProgressSteps current={2} />
        </div>
      )}

      {/* Step 3: Add Media Library */}
      {step === 3 && (
        <div key="step3" className={`flex max-h-[90vh] w-[480px] flex-col items-center gap-6 rounded-2xl border border-white/[0.06] bg-card px-10 py-12 ${slideDir === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}`}>
          <h1 className="shrink-0 brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
          <h2 className="shrink-0 text-xl font-semibold text-foreground">
            {t("addMediaLibrary")}
          </h2>

          <div className="flex w-full flex-col gap-5 overflow-y-auto pr-1">
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

            {/* Library Type */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("libraryType")}
              </label>
              <select
                value={libraryType}
                onChange={(e) => setLibraryType(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                style={{ colorScheme: "dark" }}
              >
                <option value="movie">Movie</option>
                <option value="tvshow" disabled>TV Shows (coming soon)</option>
                <option value="music" disabled>Music (coming soon)</option>
              </select>
            </div>

            {/* Folder Paths (multi-folder) */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("folderPath")}
              </label>
              <div className="flex flex-col gap-2">
                {folderPaths.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 min-w-0">
                    <input
                      type="text"
                      value={p}
                      onChange={(e) => {
                        const updated = [...folderPaths];
                        updated[idx] = e.target.value;
                        setFolderPaths(updated);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 py-2.5 font-mono text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setFolderPaths(folderPaths.filter((_, i) => i !== idx))}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFolderPath}
                    onChange={(e) => setNewFolderPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newFolderPath.trim()) {
                        e.preventDefault();
                        setFolderPaths([...folderPaths, newFolderPath.trim()]);
                        setNewFolderPath("");
                      }
                    }}
                    placeholder={t("folderPathPlaceholder")}
                    className="h-11 flex-1 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 text-sm font-mono text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() => setFolderPickerOpen(true)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.06] bg-[var(--input-bg)] text-primary hover:bg-white/[0.04]"
                  >
                    <FolderOpen className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    disabled={!newFolderPath.trim()}
                    onClick={() => {
                      if (newFolderPath.trim()) {
                        setFolderPaths([...folderPaths, newFolderPath.trim()]);
                        setNewFolderPath("");
                      }
                    }}
                    className="flex h-11 items-center gap-1.5 rounded-lg border border-white/[0.06] px-3.5 text-sm text-muted-foreground hover:bg-white/[0.04] hover:text-foreground disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* TMDB Scraper */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("metadataDownloaders")}
              </label>
              <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <input
                    type="checkbox"
                    checked={scraperEnabled}
                    onChange={(e) => setScraperEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                  />
                  <span className="text-sm text-foreground">TheMovieDb</span>
                </label>
              </div>
              <p className="text-xs text-[#555568]">
                {t("metadataDownloadersDesc")}
              </p>
            </div>
            {scraperEnabled && (
              <div className="flex flex-col gap-2">
                <label className="text-[13px] font-medium text-muted-foreground">
                  {t("tmdbApiKey")}
                </label>
                <input
                  type="text"
                  value={tmdbApiKey}
                  onChange={(e) => { setTmdbApiKey(e.target.value); setTmdbApiKeyError(""); }}
                  placeholder={t("tmdbApiKeyPlaceholder")}
                  className="h-11 rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
                />
                {tmdbApiKeyError && <p className="text-xs text-destructive">{tmdbApiKeyError}</p>}
                <p className="text-xs text-[#555568]">
                  <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {t("getTmdbApiKey")}
                  </a>
                </p>
              </div>
            )}

            {/* Jellyfin Compatibility Mode */}
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-muted-foreground">
                {t("jellyfinCompatMode")}
              </label>
              <div className="rounded-lg border border-white/[0.06] bg-[var(--input-bg)]">
                <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors">
                  <input
                    type="checkbox"
                    checked={jellyfinCompat}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setJellyfinCompatConfirmOpen(true);
                      } else {
                        setJellyfinCompat(false);
                      }
                    }}
                    className="h-4 w-4 rounded border-white/[0.06] bg-[var(--input-bg)] accent-primary"
                  />
                  <span className="text-sm text-foreground">{t("jellyfinCompatMode")}</span>
                </label>
              </div>
              <p className="text-xs text-[#555568]">{t("jellyfinCompatDesc")}</p>
            </div>

            {/* Jellyfin compat confirmation dialog */}
            <Dialog open={jellyfinCompatConfirmOpen} onOpenChange={setJellyfinCompatConfirmOpen}>
              <DialogContent className="border-white/[0.06] bg-card sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>{t("jellyfinCompatConfirmTitle")}</DialogTitle>
                  <DialogDescription>{t("jellyfinCompatConfirmDesc")}</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => setJellyfinCompatConfirmOpen(false)}
                    className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setJellyfinCompat(true);
                      setJellyfinCompatConfirmOpen(false);
                    }}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    {tc("enable")}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex w-full gap-3">
            <button
              onClick={() => { setSlideDir("left"); setStep(2); }}
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

          <ProgressSteps current={3} />

          <FolderPicker
            open={folderPickerOpen}
            onOpenChange={setFolderPickerOpen}
            onSelect={(p) => setFolderPaths([...folderPaths, p])}
          />
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && (
        <div key="step4" className="flex w-[480px] flex-col items-center gap-7 rounded-2xl border border-white/[0.06] bg-card px-10 py-12 animate-slide-in-right">
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>

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

          <ProgressSteps current={4} />
        </div>
      )}
    </div>
  );
}
