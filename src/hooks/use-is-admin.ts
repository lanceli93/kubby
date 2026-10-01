"use client";

import { useSession } from "next-auth/react";

// Client-side admin check for hiding admin-only controls. This is cosmetic —
// the API routes enforce admin rights themselves via requireAdmin().
export function useIsAdmin(): boolean {
  const { data: session } = useSession();
  return !!session?.user?.isAdmin;
}
