"use client";

import { createContext, useContext, useEffect, useState } from "react";

// Push-back nav drawer. The open flag lives here (above the page shell) so the
// drawer can be rendered OUTSIDE the shell: opening it transforms the whole
// shell back into depth, and a transformed ancestor would otherwise trap the
// drawer's `position: fixed` and break its backdrop. See `.page-shell` in
// globals.css for the depth transform itself.

interface NavDrawerContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function NavDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <NavDrawerContext.Provider value={{ open, setOpen }}>{children}</NavDrawerContext.Provider>;
}

export function useNavDrawer() {
  const ctx = useContext(NavDrawerContext);
  if (!ctx) throw new Error("useNavDrawer must be used within NavDrawerProvider");
  return ctx;
}

// Matches the `.page-shell` transition (500ms) plus a little slack, so the
// shell only drops its transform / clip / compositing hint once it is home.
const CLOSE_SETTLE_MS = 560;

/**
 * The app shell (header + main + fixed bars). While the drawer is open it
 * recedes into depth to the right; once the close transition settles it goes
 * back to having NO transform at all, so fixed descendants and backdrop-filter
 * behave normally. The dim layer doubles as the click-to-close target.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useNavDrawer();
  // `settled` = closed AND the close transition has finished. Opening flips it
  // during render (adjust-state-on-prop-change), closing flips it back after
  // the transition via a timer, so `closing` keeps the transform alive just
  // long enough to animate home.
  const [settled, setSettled] = useState(true);
  if (open && settled) setSettled(false);
  const phase = open ? "open" : settled ? "closed" : "closing";

  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => setSettled(true), CLOSE_SETTLE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const active = phase !== "closed";

  return (
    <>
      {/* The deeper "room" the shell recedes into — only exists while the
          shell is away, so it can never show through a closed page. */}
      {active && <div aria-hidden className="page-shell-room" />}
      <div className="page-shell relative flex h-full flex-col" data-drawer={phase}>
        {children}
        <div
          aria-hidden
          className="page-shell-dim"
          onClick={() => setOpen(false)}
        />
      </div>
    </>
  );
}
