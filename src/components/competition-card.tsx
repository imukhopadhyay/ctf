import Link from "next/link";
import { CalendarClock, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./status-badge";
import { Countdown } from "./countdown";
import { formatDateTime } from "@/lib/utils";

const THEMES: Record<string, string> = {
  teal: "from-primary/25 via-primary/5",
  cyan: "from-accent/25 via-accent/5",
  emerald: "from-success/25 via-success/5",
  indigo: "from-indigo-400/25 via-indigo-400/5",
  slate: "from-slate-400/20 via-slate-400/5",
};

export interface CompetitionSummary {
  slug: string;
  name: string;
  tagline: string | null;
  status: string;
  bannerTheme: string;
  startsAt: Date;
  endsAt: Date | null;
  timezone: string;
  mode: string;
  accessMode: string;
  isPractice: boolean;
  institution: { name: string } | null;
  _count?: { registrations: number; teams: number };
}

export function CompetitionCard({ c }: { c: CompetitionSummary }) {
  const now = Date.now();
  const upcoming = c.startsAt.getTime() > now;
  return (
    <Card className="group overflow-hidden transition-colors hover:border-border-strong">
      <Link href={`/competitions/${c.slug}`} className="block">
        <div className={`h-2 bg-gradient-to-r ${THEMES[c.bannerTheme] ?? THEMES.teal} to-transparent`} />
        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={c.status} />
            {c.isPractice && <Badge tone="primary">practice</Badge>}
            <Badge tone="muted">{c.mode === "TEAM" ? "team" : "individual"}</Badge>
            {c.accessMode !== "PUBLIC" && <Badge tone="muted">{c.accessMode.toLowerCase()}</Badge>}
          </div>
          <h3 className="mt-3 text-lg font-semibold group-hover:text-primary">{c.name}</h3>
          {c.tagline && <p className="mt-1 line-clamp-2 text-sm text-muted">{c.tagline}</p>}
          <div className="mt-4 space-y-1.5 text-xs text-muted">
            <p className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{formatDateTime(c.startsAt, c.timezone)}{c.endsAt ? ` → ${formatDateTime(c.endsAt, c.timezone)}` : ""}</p>
            {c._count && <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" />{c._count.registrations} registered{c.mode === "TEAM" ? ` · ${c._count.teams} teams` : ""}</p>}
            {c.institution && <p>{c.institution.name}</p>}
          </div>
          {(c.status === "ACTIVE" && c.endsAt) || (upcoming && c.status === "SCHEDULED") ? (
            <div className="mt-3 text-xs">
              <Countdown target={(upcoming ? c.startsAt : c.endsAt!).toISOString()} label={upcoming ? "Starts in" : "Ends in"} />
            </div>
          ) : null}
        </div>
      </Link>
    </Card>
  );
}
