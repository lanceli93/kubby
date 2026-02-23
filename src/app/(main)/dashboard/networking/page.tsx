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
  const [port, setPort] = useState(3000);
  const [saving, setSaving] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/networking")
      .then((r) => r.json())
      .then((data: NetworkingSettings) => {
        setSettings(data);
        setPort(data.port);
      })
      .catch(console.error);
  }, []);

  const hasChanges = settings !== null && port !== settings.port;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings/networking", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      if (data.restartRequired) {
        setRestartRequired(true);
        setSettings((prev) => (prev ? { ...prev, port } : prev));
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
        <h1 className="text-2xl font-bold text-foreground">{t("networking")}</h1>
        <div className="text-muted-foreground">{tc("loading")}...</div>
      </div>
    );
  }

  const isDocker = settings.isDocker;
  const configDiffers = restartRequired || settings.runtime.port !== settings.port;

  return (
    <div className="flex flex-col gap-6 p-8 px-10">
      <h1 className="text-2xl font-bold text-foreground">{t("networking")}</h1>

      {/* Docker mode banner */}
      {isDocker && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
          <Info className="h-4 w-4 shrink-0" />
          {t("networkingDockerMode")}
        </div>
      )}

      {/* Restart required banner */}
      {configDiffers && !isDocker && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {t("networkingRestartRequired")}
        </div>
      )}

      <div className="flex max-w-xl flex-col gap-5 rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl p-6">
        <h2 className="text-lg font-semibold text-foreground">
          {t("networkingServerSettings")}
        </h2>

        {/* Currently listening on */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-muted-foreground">
            {t("networkingCurrentlyListening")}
          </label>
          <div className="h-11 flex items-center rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 font-mono text-sm text-muted-foreground">
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
            value={port}
            onChange={(e) => {
              setPort(parseInt(e.target.value, 10) || 3000);
              setError("");
            }}
            disabled={isDocker}
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-[var(--input-bg)] px-3.5 font-mono text-sm text-foreground placeholder:text-[#555568] focus:border-primary focus:outline-none disabled:opacity-50"
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
            disabled={saving || !hasChanges}
            className="self-start rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "..." : tc("save")}
          </button>
        )}
      </div>
    </div>
  );
}
