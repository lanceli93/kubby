"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GlassToast } from "@/components/ui/glass-toast";

/**
 * fetch() that rejects on a non-2xx response, so a useMutation's onError (or a
 * try/catch) fires instead of the caller silently treating a 403/500 as
 * success. Network failures reject as usual.
 */
export async function fetchOk(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res;
}

/**
 * Transient error toast for mutations. Returns `showError(text)` and the
 * `errorToast` element — render it once anywhere in the component tree. It is
 * portaled to <body> (so a transformed / backdrop-filtered ancestor can't
 * become its containing block) at z-[100], above open dialogs.
 */
export function useErrorToast(durationMs = 3500) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const showError = useCallback(
    (text: string) => {
      clearTimeout(timer.current);
      setMessage(text);
      timer.current = setTimeout(() => setMessage(null), durationMs);
    },
    [durationMs],
  );

  // message is only ever set client-side (after an event), so document exists.
  const errorToast = message
    ? createPortal(
        <GlassToast visible success={false} position="top" className="z-[100]">
          {message}
        </GlassToast>,
        document.body,
      )
    : null;

  return { showError, errorToast };
}
