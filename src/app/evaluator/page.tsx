import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";

export const metadata = { title: "Evaluation" };

export default async function EvaluatorPage() {
  const user = await requireUser("/evaluator");
  const where = user.role === "ADMIN" ? {} : { staff: { some: { userId: user.id } } };
  const competitions = await db.competition.findMany({
    where,
    orderBy: { startsAt: "desc" },
    select: {
      id: true, name: true, status: true,
      _count: { select: { submissions: { where: { result: "PENDING_REVIEW" } } } },
      challenges: { where: { status: { in: ["IN_REVIEW", "DRAFT", "APPROVED"] } }, select: { id: true, title: true, status: true, _count: { select: { reviews: true } } } },
    },
  });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="faculty / evaluator" title="Evaluation" description="Review challenge quality, grade write-ups and monitor progress in competitions you are assigned to." />
      {competitions.length === 0 && <EmptyState icon={ClipboardCheck} title="No assignments">An organizer or administrator must assign you to a competition.</EmptyState>}
      {competitions.map((c) => (
        <Card key={c.id}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">{c.name}<StatusBadge status={c.status} /></CardTitle>
            <div className="flex gap-3 text-sm">
              <Link className="text-accent hover:underline" href={`/organizer/competitions/${c.id}`}>Analytics</Link>
              <Link className="text-accent hover:underline" href={`/organizer/competitions/${c.id}/grading`}>Grading ({c._count.submissions})</Link>
            </div>
          </CardHeader>
          <CardContent>
            {c.challenges.length === 0 ? <p className="text-sm text-muted">No challenges awaiting review.</p> : (
              <Table>
                <THead><TR><TH>Challenge</TH><TH>Status</TH><TH className="text-right">Reviews</TH></TR></THead>
                <TBody>{c.challenges.map((ch) => <TR key={ch.id}><TD><Link href={`/organizer/challenges/${ch.id}`} className="hover:text-primary">{ch.title}</Link></TD><TD><StatusBadge status={ch.status} /></TD><TD className="text-right font-mono">{ch._count.reviews}</TD></TR>)}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
