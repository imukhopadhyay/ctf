import { notFound } from "next/navigation";
import { getVisibleCompetition } from "@/server/services/competitions";
import { getCurrentUser } from "@/server/auth/current";
import { CompetitionNav } from "@/components/competition-nav";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { AppError } from "@/server/errors";

export default async function CompetitionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const res = await getVisibleCompetition(user, slug).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!res) notFound();
  const { competition: c, isStaff } = res;
  const upcoming = c.startsAt.getTime() > Date.now();
  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <StatusBadge status={c.status} />
            {c.institution && <span className="text-xs text-muted">{c.institution.name}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">{c.name}</h1>
          {c.tagline && <p className="mt-1 text-muted">{c.tagline}</p>}
        </div>
        {((c.status === "ACTIVE" && c.endsAt) || (upcoming && c.status === "SCHEDULED")) && (
          <div className="rounded-lg border border-border bg-surface px-4 py-2 text-sm">
            <Countdown target={(upcoming ? c.startsAt : c.endsAt!).toISOString()} label={upcoming ? "Starts in" : "Time left"} />
          </div>
        )}
      </div>
      <CompetitionNav slug={c.slug} mode={c.mode} isStaff={isStaff} competitionId={c.id} />
      {children}
    </div>
  );
}
