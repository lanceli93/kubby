"use client";

import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { setLocale } from "@/i18n/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LanguagePreferencesPage() {
  const t = useTranslations("settings");
  const router = useRouter();
  const locale = useLocale();

  return (
    <div className="h-full overflow-y-scroll">
    <div className="stagger-children flex flex-col items-center gap-6 px-4 md:px-0 py-8">
      <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("language")}</h1>

      <div className="flex w-full max-w-[720px] flex-col gap-5 rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl ring-1 ring-white/[0.06] p-7">
        <p className="text-sm text-muted-foreground">{t("languageDesc")}</p>
        <Select
          value={locale}
          onValueChange={async (newLocale) => {
            await setLocale(newLocale);
            await fetch("/api/users/me", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ locale: newLocale }),
            });
            router.refresh();
          }}
        >
          <SelectTrigger className="h-11 w-48 rounded-md border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="en">English</SelectItem>
            <SelectItem value="zh">中文</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
    </div>
  );
}
