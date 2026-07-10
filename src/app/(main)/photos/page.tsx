"use client";

import { useTranslations } from "next-intl";

// Placeholder for the photos domain home. The real timeline (justified grid,
// virtual scroll, cursor pagination — see docs/photos-library-design.md §7)
// lands in a later task; this just proves the domain route/nav wiring works
// and establishes the bright/neutral theme that sets photos apart from the
// dark cinema domain.
export default function PhotosPage() {
  const t = useTranslations("photos");

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-neutral-100 text-neutral-900">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-neutral-500">{t("comingSoon")}</p>
    </div>
  );
}
