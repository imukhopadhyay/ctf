import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState, Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/server/auth/current";
import { getVisibleCompetition } from "@/server/services/competitions";
import { getMyTeam } from "@/server/services/teams";
import { relativeTime } from "@/lib/utils";
import { TeamSetup, TeamActions } from "./team-actions";

export const metadata = { title: "My team" };

export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser(`/competitions/${slug}/team`);
  const vis = await getVisibleCompetition(user, slug).catch(() => null);
  if (!vis) notFound();
  const c = vis.competition;
  if (c.mode !== "TEAM") return <EmptyState icon={Users} title="This is an individual competition">Teams are not used here.</EmptyState>;
  const { team, participation } = await getMyTeam(user, c.id);
  const locked = (c.status === "ACTIVE" || c.status === "PAUSED") && !c.allowTeamChangesWhileActive;

  if (!team) {
    if (participation.registrationStatus !== "APPROVED") return <Alert tone="warning" title="Register first">You must be an approved participant before creating or joining a team.</Alert>;
    return <TeamSetup competitionId={c.id} maxSize={c.maxTeamSize} locked={locked || c.status === "COMPLETED" || c.status === "ARCHIVED"} />;
  }
  const isCaptain = team.captainId === user.id;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{team.name}</h2>
          <p className="text-sm text-muted">{team.contributions.length} / {c.maxTeamSize} members · {isCaptain ? "you are the captain" : "member"}</p>
        </div>
        <TeamActions competitionId={c.id} inviteCode={team.inviteCode ?? ""} isCaptain={isCaptain} locked={locked} members={team.contributions.map((m) => ({ id: m.userId, name: m.displayName }))} selfId={user.id} teamId={team.id} />
      </div>
      {team.contributions.length < c.minTeamSize && <Alert tone="warning">This competition expects at least {c.minTeamSize} members per team.</Alert>}
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Team score" value={team.score} />
        <Stat label="Challenges solved" value={team.solves.length} />
        <Stat label="First bloods" value={team.solves.filter((s) => s.isFirstBlood).length} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Members & contributions</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <THead><TR><TH>Member</TH><TH>Role</TH><TH className="text-right">Solves</TH><TH className="text-right">Points</TH></TR></THead>
              <TBody>
                {team.contributions.map((m) => (
                  <TR key={m.userId}>
                    <TD>{m.displayName} <span className="font-mono text-xs text-subtle">@{m.username}</span></TD>
                    <TD>{m.role === "CAPTAIN" ? <Badge tone="primary">captain</Badge> : <Badge tone="muted">member</Badge>}</TD>
                    <TD className="text-right font-mono">{m.solves}</TD>
                    <TD className="text-right font-mono">{m.points}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Team activity</CardTitle></CardHeader>
          <CardContent>
            {team.activity.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
              <ol className="space-y-2 text-sm">
                {team.activity.map((a, i) => (
                  <li key={i} className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
                    <span className={a.kind === "solve" ? "text-fg" : "text-muted"}>{a.text}</span>
                    <span className="whitespace-nowrap text-xs text-subtle">{relativeTime(a.at)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {team.achievements.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Team achievements</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">{team.achievements.map((a) => <Badge key={a.name} tone="primary" title={a.description}>🏅 {a.name}</Badge>)}</CardContent>
        </Card>
      )}
    </div>
  );
}
