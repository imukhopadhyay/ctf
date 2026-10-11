import Link from "next/link";
import { Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { hasPlatformPermission } from "@/server/domain/permissions";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Organizer" };

export default async function OrganizerHome() {
  const user = await requireUser("/organizer");
  const competitions = await db.competition.findMany({
    where: user.role === "ADMIN" ? {} : { staff: { some: { userId: user.id } } },
    orderBy: { startsAt: "desc" },
    include: { _count: { select: { challenges: true, registrations: true, teams: true, solves: true } }, staff: { where: { userId: user.id }, select: { role: true } } },
  });
  const canCreate = hasPlatformPermission(user.role, "competition.create");
  return (
    <div>
      <PageHeader eyebrow="organizer" title="Competitions you manage" actions={canCreate && <Button asChild><Link href="/organizer/competitions/new"><Plus />New competition</Link></Button>} />
      {competitions.length === 0 ? (
        <EmptyState icon={Wrench} title="No competitions yet">{canCreate ? "Create your first competition to get started." : "Ask an administrator to assign you to a competition."}</EmptyState>
      ) : (
        <Card>
          <Table>
            <THead><TR><TH>Competition</TH><TH>Status</TH><TH>Starts</TH><TH className="text-right">Challenges</TH><TH className="text-right">Registered</TH><TH className="text-right">Solves</TH><TH>Your role</TH></TR></THead>
            <TBody>
              {competitions.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/organizer/competitions/${c.id}`} className="font-medium hover:text-primary">{c.name}</Link><div className="font-mono text-xs text-subtle">{c.slug}</div></TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD className="text-xs text-muted">{formatDateTime(c.startsAt, c.timezone)}</TD>
                  <TD className="text-right font-mono">{c._count.challenges}</TD>
                  <TD className="text-right font-mono">{c._count.registrations}</TD>
                  <TD className="text-right font-mono">{c._count.solves}</TD>
                  <TD className="text-xs text-muted">{c.staff.map((s) => s.role.toLowerCase()).join(", ") || (user.role === "ADMIN" ? "admin" : "")}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
