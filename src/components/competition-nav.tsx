"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function CompetitionNav({ slug, mode, isStaff, competitionId }: { slug: string; mode: string; isStaff: boolean; competitionId: string }) {
  const path = usePathname();
  const base = `/competitions/${slug}`;
  const links = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/challenges`, label: "Challenges" },
    { href: `${base}/leaderboard`, label: "Leaderboard" },
    ...(mode === "TEAM" ? [{ href: `${base}/team`, label: "My team" }] : []),
  ];
  return (
    <nav aria-label="Competition" className="mb-6 flex flex-wrap items-center gap-1 border-b border-border">
      {links.map((l) => {
        const active = l.exact ? path === l.href : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", active ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}>
            {l.label}
          </Link>
        );
      })}
      {isStaff && (
        <Link href={`/organizer/competitions/${competitionId}`} className="ml-auto mb-1 rounded-md border border-border px-3 py-1 text-xs text-muted hover:text-fg">
          Manage →
        </Link>
      )}
    </nav>
  );
}
