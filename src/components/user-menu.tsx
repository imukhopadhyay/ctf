"use client";
import Link from "next/link";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ClipboardCheck, LayoutDashboard, Settings2, Shield, User, Wrench } from "lucide-react";
import { LogoutButton } from "./logout-button";

export function UserMenu({ user }: { user: { displayName: string; username: string; role: string } }) {
  const item = "flex items-center gap-2 rounded px-2 py-1.5 text-sm text-muted outline-none hover:bg-surface-2 hover:text-fg focus:bg-surface-2 focus:text-fg";
  return (
    <Dropdown.Root>
      <Dropdown.Trigger className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm hover:border-border-strong">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 font-mono text-xs font-bold text-primary">{user.displayName.slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate sm:inline">{user.displayName}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content align="end" sideOffset={6} className="z-50 w-56 rounded-lg border border-border bg-surface p-1 shadow-xl">
          <div className="px-2 py-2">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="truncate font-mono text-xs text-subtle">@{user.username} · {user.role.toLowerCase()}</p>
          </div>
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item asChild><Link href="/dashboard" className={item}><LayoutDashboard className="h-4 w-4" />Dashboard</Link></Dropdown.Item>
          <Dropdown.Item asChild><Link href="/profile" className={item}><User className="h-4 w-4" />Profile & achievements</Link></Dropdown.Item>
          {(user.role === "ORGANIZER" || user.role === "ADMIN") && (
            <Dropdown.Item asChild><Link href="/organizer" className={item}><Wrench className="h-4 w-4" />Organizer</Link></Dropdown.Item>
          )}
          {(user.role === "EVALUATOR" || user.role === "ORGANIZER" || user.role === "ADMIN") && (
            <Dropdown.Item asChild><Link href="/evaluator" className={item}><ClipboardCheck className="h-4 w-4" />Evaluation</Link></Dropdown.Item>
          )}
          {user.role === "ADMIN" && (
            <>
              <Dropdown.Item asChild><Link href="/admin" className={item}><Shield className="h-4 w-4" />Administration</Link></Dropdown.Item>
              <Dropdown.Item asChild><Link href="/admin/settings" className={item}><Settings2 className="h-4 w-4" />Platform settings</Link></Dropdown.Item>
            </>
          )}
          <Dropdown.Separator className="my-1 h-px bg-border" />
          <Dropdown.Item asChild><div><LogoutButton /></div></Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
