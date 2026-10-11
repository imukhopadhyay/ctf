import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { competitionCan } from "@/server/services/access";
import { getStandings } from "@/server/services/leaderboard";
import { formatDateTime } from "@/lib/utils";
import { ScoreTools } from "./score-tools";

export default async function ScoresPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const canAdjust = await competitionCan(user, id, "score.adjust");
  const [standings, events] = await Promise.all([
    getStandings(user, id),
    db.scoreEvent.findMany({ where: { competitionId: id }, orderBy: { createdAt: "desc" }, take: 100, include: { challenge: { select: { title: true } }, createdBy: { select: { username: true } } } }),
  ]);
  const names = new Map(standings.rows.map((r) => [r.subjectKey, r.name]));
  return (
    <div className="space-y-6">
      {canAdjust ? <ScoreTools competitionId={id} subjects={standings.rows.map((r) => ({ key: r.subjectKey, name: r.name }))} /> : <Alert tone="info">Read-only: only organizers can adjust scores.</Alert>}
      <Card>
        <CardHeader><CardTitle>Score ledger (latest 100)</CardTitle><CardDescription>Every point change is an immutable event. Corrections are new events, never edits.</CardDescription></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>When</TH><TH>Subject</TH><TH>Type</TH><TH className="text-right">Points</TH><TH>Reason</TH><TH>By</TH></TR></THead>
            <TBody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.createdAt)}</TD>
                  <TD className="text-sm">{names.get(e.subjectKey) ?? <span className="font-mono text-xs">{e.subjectKey}</span>}</TD>
                  <TD className="font-mono text-xs">{e.type}</TD>
                  <TD className={`text-right font-mono ${e.points < 0 ? "text-danger" : "text-success"}`}>{e.points > 0 ? "+" : ""}{e.points}</TD>
                  <TD className="text-xs">{e.reason}</TD>
                  <TD className="text-xs text-muted">{e.createdBy?.username ?? "system"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
