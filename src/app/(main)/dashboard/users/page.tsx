"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { Shield, User, Plus, Trash2, KeyRound, Check, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

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
  const tCommon = useTranslations("common");
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery<UserInfo[]>({
    queryKey: ["users"],
    queryFn: () => fetch("/api/users").then((r) => r.json()),
  });

  const adminCount = users.filter((u) => u.isAdmin).length;
  const currentUserId = session?.user?.id;

  // Toast state
  const [toast, setToast] = useState<{ text: string; success: boolean } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Add User dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  const resetAddForm = () => {
    setNewUsername("");
    setNewPassword("");
    setNewDisplayName("");
    setNewIsAdmin(false);
  };

  const createUser = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          displayName: newDisplayName || undefined,
          isAdmin: newIsAdmin,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setAddOpen(false);
      resetAddForm();
      setToast({ text: t("userCreated"), success: true });
    },
    onError: (err: Error) => {
      setToast({ text: err.message, success: false });
    },
  });

  // Delete User dialog
  const [deleteTarget, setDeleteTarget] = useState<UserInfo | null>(null);

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete user");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setDeleteTarget(null);
      setToast({ text: t("userDeleted"), success: true });
    },
    onError: (err: Error) => {
      setToast({ text: err.message, success: false });
    },
  });

  // Toggle role
  const toggleRole = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAdmin }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update role");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      setToast({ text: t("roleUpdated"), success: true });
    },
    onError: (err: Error) => {
      setToast({ text: err.message, success: false });
    },
  });

  // Reset Password dialog
  const [resetTarget, setResetTarget] = useState<UserInfo | null>(null);
  const [resetPw, setResetPw] = useState("");

  const resetPassword = useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => {
      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset password");
      }
      return res.json();
    },
    onSuccess: () => {
      setResetTarget(null);
      setResetPw("");
      setToast({ text: t("passwordResetSuccess"), success: true });
    },
    onError: (err: Error) => {
      setToast({ text: err.message, success: false });
    },
  });

  return (
    <div className="stagger-children flex flex-col gap-6 p-8 px-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t("users")}</h1>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-fluid hover:bg-primary/90 cursor-pointer active:scale-95"
        >
          <Plus className="h-4 w-4" />
          {t("addUser")}
        </button>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] shadow-[0_2px_16px_rgba(0,0,0,0.15)] backdrop-blur-xl">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          const isLastAdmin = user.isAdmin && adminCount <= 1;
          const canToggleRole = !isSelf && !isLastAdmin;
          const canDelete = !isSelf && !(user.isAdmin && adminCount <= 1);

          return (
            <div
              key={user.id}
              className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4 last:border-b-0 transition-colors hover:bg-white/[0.02]"
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
              <div className="flex items-center gap-3">
                {/* Role badge — clickable to toggle */}
                <button
                  onClick={() => {
                    if (canToggleRole) {
                      toggleRole.mutate({ id: user.id, isAdmin: !user.isAdmin });
                    }
                  }}
                  disabled={!canToggleRole}
                  title={
                    isSelf
                      ? t("cannotDeleteSelf")
                      : isLastAdmin
                        ? t("cannotDeleteLastAdmin")
                        : undefined
                  }
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    user.isAdmin
                      ? "bg-primary/10 text-primary"
                      : "bg-white/5 text-muted-foreground"
                  } ${canToggleRole ? "cursor-pointer hover:bg-white/10" : "cursor-default opacity-70"}`}
                >
                  {user.isAdmin ? t("admin") : t("userRole")}
                </button>

                <span className="text-xs text-muted-foreground">
                  {formatDate(user.createdAt)}
                </span>

                {/* Reset password */}
                <button
                  onClick={() => {
                    setResetTarget(user);
                    setResetPw("");
                  }}
                  className="rounded-md p-1.5 text-muted-foreground transition-fluid hover:bg-white/5 hover:text-foreground cursor-pointer"
                  title={t("resetPassword")}
                >
                  <KeyRound className="h-4 w-4" />
                </button>

                {/* Delete */}
                <button
                  onClick={() => canDelete && setDeleteTarget(user)}
                  disabled={!canDelete}
                  title={
                    isSelf
                      ? t("cannotDeleteSelf")
                      : isLastAdmin
                        ? t("cannotDeleteLastAdmin")
                        : t("deleteUser")
                  }
                  className={`rounded-md p-1.5 transition-fluid ${
                    canDelete
                      ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                      : "cursor-default text-muted-foreground/30"
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {users.length === 0 && (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          {t("noUsers")}
        </div>
      )}

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetAddForm(); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{t("addUserTitle")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); createUser.mutate(); }}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{t("username")}</label>
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{t("password")}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{t("displayName")}</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2.5 px-1 cursor-pointer">
              <input
                type="checkbox"
                checked={newIsAdmin}
                onChange={(e) => setNewIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-white/[0.06] bg-white/[0.05] accent-primary"
              />
              <span className="text-sm text-muted-foreground">{t("makeAdmin")}</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                disabled={createUser.isPending}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {createUser.isPending ? tCommon("loading") : tCommon("confirm")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("deleteUser")}</DialogTitle>
            <DialogDescription>
              {t("deleteUserConfirm", { name: deleteTarget?.displayName || deleteTarget?.username || "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={() => deleteTarget && deleteUser.mutate(deleteTarget.id)}
              disabled={deleteUser.isPending}
              className="rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleteUser.isPending ? tCommon("loading") : tCommon("confirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(v) => { if (!v) { setResetTarget(null); setResetPw(""); } }}>
        <DialogContent className="!bg-black/40 border-white/[0.06] backdrop-blur-xl sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t("resetPassword")}</DialogTitle>
            <DialogDescription>
              {resetTarget?.displayName || resetTarget?.username}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (resetTarget) resetPassword.mutate({ id: resetTarget.id, password: resetPw });
            }}
            className="flex flex-col gap-4 pt-2"
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-muted-foreground">{t("newPassword")}</label>
              <input
                type="password"
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                className="h-11 rounded-lg border border-white/[0.06] bg-white/[0.05] px-3.5 text-sm text-foreground focus:border-primary focus:outline-none"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setResetTarget(null); setResetPw(""); }}
                className="rounded-lg px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                disabled={resetPassword.isPending}
                className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {resetPassword.isPending ? tCommon("loading") : tCommon("confirm")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Toast */}
      <div
        className={`fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm transition-all duration-300 ${
          toast
            ? "translate-y-0 opacity-100"
            : "translate-y-4 opacity-0 pointer-events-none"
        } ${
          toast?.success
            ? "border-green-500/20 bg-green-500/10 text-green-400"
            : "border-red-500/20 bg-red-500/10 text-red-400"
        }`}
      >
        {toast?.success ? (
          <Check className="h-4 w-4" />
        ) : (
          <AlertCircle className="h-4 w-4" />
        )}
        {toast?.text}
      </div>
    </div>
  );
}
