"use client";

import { useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassToast } from "@/components/ui/glass-toast";

export default function LanguagePreferencesPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const locale = useLocale();
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = (text: string, success: boolean) => {
    clearTimeout(toastTimer.current);
    setToast({ text, success });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  async function handleLocaleChange(newLocale: string) {
    await setLocale(newLocale);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
      if (res.ok) {
        showToast(t("changesSaved"), true);
      } else {
        showToast(t("failedToSave"), false);
      }
    } catch {
      showToast(t("somethingWentWrong"), false);
    }
    router.refresh();
  }

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("language")}</h1>

      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <p className="text-sm text-muted-foreground">{t("languageDesc")}</p>
        <Select value={locale} onValueChange={handleLocaleChange}>
          <SelectTrigger className="h-11 w-48 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <GlassToast visible={!!toast} success={toast?.success}>
        {toast?.text}
      </GlassToast>
    </div>
    </div>
  );
}
