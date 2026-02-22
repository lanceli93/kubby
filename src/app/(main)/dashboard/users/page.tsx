"use client";

import { useQuery } from "@tanstack/react-query";
import { Shield, User } from "lucide-react";
import { useTranslations } from "next-intl";

interface UserInfo {
  id: string;
  username: string;
  displayName?: string;
  isAdmin: boolean;
  createdAt: string;
}

function formatDate(raw: string): string {
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function UsersPage() {
  const t = useTranslations("dashboard");
  const { data: users = [] } = useQuery<UserInfo[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  return (
    <div className="flex flex-col gap-6 p-8 px-10">
      <h1 className="text-2xl font-bold text-foreground">{t("users")}</h1>

      <div className="rounded-xl border border-white/[0.06] bg-black/40 backdrop-blur-xl">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 last:border-b-0"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                {user.isAdmin ? (
                  <Shield className="h-5 w-5 text-primary" />
                ) : (
                  <User className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {user.displayName || user.username}
                </p>
                {user.displayName && user.displayName !== user.username && (
                  <p className="text-xs text-muted-foreground">{user.username}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  user.isAdmin
                    ? "bg-primary/10 text-primary"
                    : "bg-white/5 text-muted-foreground"
                }`}
              >
                {user.isAdmin ? "Admin" : "User"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(user.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          No users found
        </div>
      )}
    </div>
  );
}
