"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth");

  // POST /api/users is admin-only once a first user exists, so the open
  // registration form is a dead end after setup (it 403s). Redirect to the
  // first-run wizard when setup hasn't happened yet, otherwise show a
  // friendly "ask your admin" state instead of a form that can't succeed.
  const [status, setStatus] = useState<"checking" | "needsSetup" | "disabled">("checking");

  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.needsSetup) {
          router.replace("/setup");
          setStatus("needsSetup");
        } else {
          setStatus("disabled");
        }
      })
      .catch(() => setStatus("disabled"));
  }, [router]);

  // Still checking, or redirecting to /setup — render nothing to avoid a
  // flash of a form that would 403 anyway.
  if (status === "checking" || status === "needsSetup") {
    return <div className="h-full bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]" />;
  }

  return (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(ellipse_at_center,#111128,#0a0a0f)]">
      <div className="w-full max-w-[30rem] mx-4 md:mx-0 animate-fade-in-up rounded-2xl border border-white/[0.06] glass-cinema p-6 md:p-10">
        <div className="flex flex-col items-center gap-5 text-center">
          <h1 className="brand-glow text-4xl font-bold tracking-tight text-primary">Kubby</h1>
          <p className="text-[0.9375rem] font-medium text-foreground">{t("registrationDisabled")}</p>
          <p className="text-sm text-muted-foreground">{t("askAdminCreateAccount")}</p>
          <Link
            href="/login"
            className="text-[0.8125rem] font-semibold text-primary hover:underline"
          >
            {t("backToSignIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}
