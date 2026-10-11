"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function OrganizerTabs({ id, mode }: { id: string; mode: string }) {
  const path = usePathname();
  const base = `/organizer/competitions/${id}`;
  const tabs = [
    ["", "Overview"],
    ["/challenges/new", "Challenges"],
    ["/participants", mode === "TEAM" ? "Participants & teams" : "Participants"],
    ["/announcements", "Announcements"],
    ["/grading", "Grading"],
    ["/scores", "Scores"],
    ["/instances", "Instances"],
    ["/staff", "Staff"],
    ["/settings", "Settings"],
  ];
  return (
    <nav aria-label="Competition management" className="mb-6 flex flex-wrap gap-1 border-b border-border">
      {tabs.map(([suffix, label]) => {
        const href = `${base}${suffix}`;
        const active = suffix === "" ? path === base : path.startsWith(href.replace("/new", ""));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
