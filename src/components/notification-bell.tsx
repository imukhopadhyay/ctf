"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Bell } from "lucide-react";
import { api } from "@/lib/api-client";
import { relativeTime } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [data, setData] = useState<{ items: Notification[]; unread: number } | null>(null);
  const load = useCallback(() => api<{ items: Notification[]; unread: number }>("/api/v1/notifications").then(setData).catch(() => undefined), []);
  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Dropdown.Root onOpenChange={(open) => open && data?.unread && api("/api/v1/notifications/read", { method: "POST", body: { ids: "all" } }).then(load)}>
      <Dropdown.Trigger className="relative rounded-md p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications${data?.unread ? ` (${data.unread} unread)` : ""}`}>
        <Bell className="h-5 w-5" />
        {!!data?.unread && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-fg">{data.unread > 9 ? "9+" : data.unread}</span>}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-50 max-h-96 w-80 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-xl">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Notifications</div>
          {!data?.items.length && <p className="px-3 py-6 text-center text-sm text-muted">You&apos;re all caught up.</p>}
          {data?.items.map((n) => (
            <Dropdown.Item key={n.id} asChild>
              <Link href={n.link ?? "#"} className="block rounded px-3 py-2 outline-none hover:bg-surface-2 focus:bg-surface-2">
                <p className={`text-sm ${n.readAt ? "text-muted" : "text-fg"}`}>{n.title}</p>
                {n.body && <p className="line-clamp-2 text-xs text-subtle">{n.body}</p>}
                <p className="mt-0.5 text-[11px] text-subtle">{relativeTime(n.createdAt)}</p>
              </Link>
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
