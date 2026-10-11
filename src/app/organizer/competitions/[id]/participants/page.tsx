import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton } from "@/components/organizer/action-button";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { competitionCan } from "@/server/services/access";
import { listRegistrations } from "@/server/services/competitions";
import { listTeams } from "@/server/services/teams";
import { formatDateTime } from "@/lib/utils";

export default async function ParticipantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!(await competitionCan(user, id, "participants.manage"))) return <Alert tone="warning">Only organizers can manage participants.</Alert>;
  const c = await db.competition.findUniqueOrThrow({ where: { id }, select: { mode: true, timezone: true } });
  const [regs, teams] = await Promise.all([listRegistrations(user, id), c.mode === "TEAM" ? listTeams(user, id) : Promise.resolve([])]);
  const pending = regs.filter((r) => r.status === "PENDING");
  return (
    <div className="space-y-6">
      {pending.length > 0 && <Alert tone="warning">{pending.length} registration(s) awaiting approval.</Alert>}
      <Card>
        <CardHeader><CardTitle>Registrations ({regs.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Participant</TH><TH>Email</TH><TH>Institution</TH>{c.mode === "TEAM" && <TH>Team</TH>}<TH>Registered</TH><TH>Status</TH><TH className="sr-only">Actions</TH></TR></THead>
            <TBody>
              {regs.map((r) => (
                <TR key={r.id}>
                  <TD>{r.user.displayName} <span className="font-mono text-xs text-subtle">@{r.user.username}</span>{r.user.status === "SUSPENDED" && <Badge tone="danger" className="ml-2">suspended</Badge>}</TD>
                  <TD className="text-xs text-muted">{r.user.email}</TD>
                  <TD className="text-xs text-muted">{r.user.institution?.name ?? "—"}</TD>
                  {c.mode === "TEAM" && <TD className="text-xs">{r.user.memberships[0]?.team.name ?? "—"}</TD>}
                  <TD className="text-xs text-muted">{formatDateTime(r.createdAt, c.timezone)}</TD>
                  <TD><StatusBadge status={r.status} /></TD>
                  <TD className="space-x-1 whitespace-nowrap text-right">
                    {r.status !== "APPROVED" && <ActionButton size="sm" path={`/api/v1/competitions/${id}/registrations/${r.id}`} method="PATCH" body={{ decision: "APPROVED" }}>Approve</ActionButton>}
                    {r.status !== "REJECTED" && <ActionButton size="sm" variant="ghost" path={`/api/v1/competitions/${id}/registrations/${r.id}`} method="PATCH" body={{ decision: "REJECTED" }} confirmText="Reject this registration?">Reject</ActionButton>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      {c.mode === "TEAM" && (
        <Card>
          <CardHeader><CardTitle>Teams ({teams.length})</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Team</TH><TH>Captain</TH><TH>Members</TH><TH className="text-right">Solves</TH><TH>Visibility</TH><TH className="sr-only">Actions</TH></TR></THead>
              <TBody>
                {teams.map((t) => (
                  <TR key={t.id}>
                    <TD className="font-medium">{t.name}</TD>
                    <TD className="font-mono text-xs">{t.captain?.username ?? "—"}</TD>
                    <TD className="text-xs text-muted">{t.members.map((m) => m.user.displayName).join(", ") || "—"}</TD>
                    <TD className="text-right font-mono">{t._count.solves}</TD>
                    <TD>{t.hidden ? <Badge tone="danger">hidden</Badge> : <Badge tone="success">public</Badge>}</TD>
                    <TD className="text-right">
                      <ActionButton size="sm" variant="ghost" path={`/api/v1/competitions/${id}/teams/${t.id}`} method="PATCH" body={{ hidden: !t.hidden }} promptText={t.hidden ? "Reason for restoring this team:" : "Reason for hiding/disqualifying this team:"} promptKey="reason">{t.hidden ? "Unhide" : "Hide"}</ActionButton>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
