import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { competitionCan } from "@/server/services/access";
import { StatusBadge } from "@/components/status-badge";
import { OrganizerTabs } from "./tabs";

export default async function OrganizerCompetitionLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/organizer/competitions/${id}`);
  const c = await db.competition.findUnique({ where: { id }, select: { id: true, name: true, slug: true, status: true, mode: true } });
  if (!c || !(await competitionCan(user, id, "competition.view_staff"))) notFound();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/organizer" className="text-xs text-muted hover:text-fg">← Organizer</Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold">{c.name} <StatusBadge status={c.status} /></h1>
        </div>
        <Link href={`/competitions/${c.slug}`} className="text-sm text-accent hover:underline">Participant view →</Link>
      </div>
      <OrganizerTabs id={c.id} mode={c.mode} />
      {children}
    </div>
  );
}
