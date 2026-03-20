"use client";

import { Check, AlertCircle } from "lucide-react";

interface GlassToastProps {
  visible: boolean;
  success?: boolean;
  position?: "bottom" | "top";
  children: React.ReactNode;
}

export function GlassToast({ visible, success = true, position = "bottom", children }: GlassToastProps) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-[#0a0a0f]/70 px-5 py-3 text-sm font-medium text-foreground shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-2xl ring-1 ring-white/[0.06] ${
        position === "top" ? "top-6" : "bottom-6"
      }`}
    >
      {success ? (
        <Check className="h-4 w-4 flex-shrink-0 text-primary" />
      ) : (
        <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
      )}
      {children}
    </div>
  );
}
