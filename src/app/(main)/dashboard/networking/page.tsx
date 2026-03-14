"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info } from "lucide-react";

interface NetworkingSettings {
  port: number;
  runtime: { port: number };
  isDocker: boolean;
}

export default function NetworkingSettingsPage() {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const [settings, setSettings] = useState<NetworkingSettings | null>(null);
  const [portStr, setPortStr] = useState("8665");
  const [saving, setSaving] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/networking")
      .then((r) => r.json())
      .then((data: NetworkingSettings) => {
        setSettings(data);
        setPortStr(String(data.port));
      })
      .catch(console.error);
  }, []);

  const portNum = parseInt(portStr, 10);
  const portValid = !isNaN(portNum) && portNum >= 1024 && portNum <= 65535;
  const hasChanges = settings !== null && portValid && portNum !== settings.port;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/networking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port: portNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      if (data.restartRequired) {
        setRestartRequired(true);
        setSettings((prev) => (prev ? { ...prev, port: portNum } : prev));
      }
    } catch {
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex flex-col gap-6 p-8 px-10">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("networking")}</h1>
        <div className="text-muted-foreground">{tc("loading")}...</div>
      </div>
    );
  }

  const isDocker = settings.isDocker;
  const configDiffers = restartRequired || settings.runtime.port !== settings.port;

  return (
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      {/* Restart required toast */}
      {configDiffers && !isDocker && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-950/90 px-4 py-2.5 text-sm text-amber-400 shadow-lg backdrop-blur-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t("networkingRestartRequired")}
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("networking")}</h1>

      {/* Docker mode banner */}
      {isDocker && (
        <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-400">
          <Info className="h-4 w-4 shrink-0" />
          {t("networkingDockerMode")}
        </div>
      )}

      <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {t("networkingServerSettings")}
        </h2>

        {/* Currently listening on */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("networkingCurrentlyListening")}
          </label>
          <div className="h-11 flex items-center rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 font-mono text-sm text-muted-foreground">
            0.0.0.0:{settings.runtime.port}
          </div>
        </div>

        {/* Port */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("networkingPort")}
          </label>
          <input
            type="number"
            min={1024}
            max={65535}
            value={portStr}
            onChange={(e) => {
              setPortStr(e.target.value);
              setError("");
            }}
            disabled={isDocker}
            className="h-11 w-full rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <p className="text-xs text-[#555568]">
            {t("networkingPortHelp")}
          </p>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        {/* Save button */}
        {!isDocker && (
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges || !portValid}
            className="self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 cursor-pointer transition-fluid active:scale-95"
          >
            {saving ? "..." : tc("save")}
          </button>
        )}
      </div>
    </div>
  );
}
