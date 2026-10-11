"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
      onClick={async () => {
        await api("/api/v1/auth/logout", { method: "POST" }).catch(() => undefined);
        router.push("/");
        router.refresh();
      }}
    >
      <LogOut className="h-4 w-4" /> Sign out
    </button>
  );
}
