import { Trophy } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { CompetitionCard } from "@/components/competition-card";
import { listCompetitions } from "@/server/services/competitions";
import { getCurrentUser } from "@/server/auth/current";

export const metadata = { title: "Competitions" };

export default async function CompetitionsPage() {
  const user = await getCurrentUser();
  const all = await listCompetitions(user);
  const groups = [
    { title: "Active", items: all.filter((c) => c.status === "ACTIVE" || c.status === "PAUSED") },
    { title: "Upcoming", items: all.filter((c) => c.status === "SCHEDULED") },
    { title: "Completed", items: all.filter((c) => c.status === "COMPLETED" || c.status === "ARCHIVED") },
  ];
  return (
    <div>
      <PageHeader eyebrow="directory" title="Competitions" description="Join an active event, register for an upcoming one, or study completed challenges and their solutions." />
      {all.length === 0 && <EmptyState icon={Trophy} title="No competitions published yet" />}
      <div className="space-y-10">
        {groups.filter((g) => g.items.length).map((g) => (
          <section key={g.title} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className="mb-3 text-lg font-semibold">{g.title} <span className="font-mono text-sm text-muted">({g.items.length})</span></h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{g.items.map((c) => <CompetitionCard key={c.slug} c={c} />)}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
