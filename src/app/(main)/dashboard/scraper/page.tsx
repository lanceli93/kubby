"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

export default function ScraperSettingsPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/api/settings/scraper")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(data.configured);
        setMaskedKey(data.tmdbApiKey);
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/settings/scraper", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbApiKey: apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setStatus("saved");
        setConfigured(true);
        setMaskedKey(apiKey.slice(0, 4) + "..." + apiKey.slice(-4));
        setApiKey("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("scraperSettings")}</h1>

      <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-6">
        <h2 className="text-lg font-semibold text-foreground">{t("metadataProviders")}</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("tmdbApiKey")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setStatus("idle");
                }}
                placeholder={configured ? maskedKey : "Enter TMDB API key..."}
                className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.05] px-3.5 pr-10 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-fluid active:scale-95"
            >
              {saving ? "..." : tc("save")}
            </button>
          </div>
          <p className="text-xs text-[#555568]">
            {t("tmdbApiKeyHelp")}
          </p>
        </div>

        {status === "saved" && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            {t("apiKeySaved")}
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            {t("apiKeyInvalid")}
          </div>
        )}

        {configured && status === "idle" && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            TMDB API key configured
          </div>
        )}
      </div>
    </div>
  );
}
