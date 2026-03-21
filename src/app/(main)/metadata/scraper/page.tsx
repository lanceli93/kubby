"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, CheckCircle } from "lucide-react";
import { GlassToast } from "@/components/ui/glass-toast";

export default function MetadataProvidersPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  // TMDB API key state
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [maskedKey, setMaskedKey] = useState("");
  const [saving, setSaving] = useState(false);

  // NFO writeback state
  const [nfoWriteback, setNfoWriteback] = useState(true);
  const [nfoLoading, setNfoLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  function showToast(text: string, success: boolean) {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    fetch("/api/settings/scraper")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(data.configured);
        setMaskedKey(data.tmdbApiKey);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/api/settings/nfo-writeback")
      .then((r) => r.json())
      .then((data) => setNfoWriteback(data.enabled))
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/scraper", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbApiKey: apiKey }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        showToast(t("apiKeySaved"), true);
        setConfigured(true);
        setMaskedKey(apiKey.slice(0, 4) + "..." + apiKey.slice(-4));
        setApiKey("");
      } else {
        showToast(t("apiKeyInvalid"), false);
      }
    } catch {
      showToast(t("apiKeyInvalid"), false);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleNfoWriteback = async () => {
    const newValue = !nfoWriteback;
    setNfoWriteback(newValue);
    setNfoLoading(true);
    try {
      await fetch("/api/settings/nfo-writeback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newValue }),
      });
    } catch {
      setNfoWriteback(!newValue);
    } finally {
      setNfoLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">
        {t("metadataProviders")}
      </h1>

      <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-6">
        {/* TMDB API Key */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("tmdbApiKey")}
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? maskedKey : "Enter TMDB API key..."}
                className="h-11 w-full rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 pr-10 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none"
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
          <p className="text-xs text-[#555568]">{t("tmdbApiKeyHelp")}</p>
        </div>

        {configured && (
          <div className="flex items-center gap-2 text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            TMDB API key configured
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* NFO Writeback Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{t("nfoWriteback")}</p>
            <p className="text-xs text-muted-foreground">{t("nfoWritebackDesc")}</p>
          </div>
          <button
            onClick={handleToggleNfoWriteback}
            disabled={nfoLoading}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-fluid cursor-pointer ${
              nfoWriteback ? "bg-primary" : "bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                nfoWriteback ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <GlassToast visible={!!toast} success={toast?.success}>
        {toast?.text}
      </GlassToast>
    </div>
    </div>
  );
}
