import { notFound } from "next/navigation";
import { Droplet, Snowflake, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProgressionChart } from "@/components/charts";
import { CategoryIcon } from "@/components/category-icon";
import { getCurrentUser } from "@/server/auth/current";
import { getVisibleCompetition } from "@/server/services/competitions";
import { getStandings } from "@/server/services/leaderboard";
import { formatDateTime, cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "Leaderboard" };
const CATS = ["web", "crypto", "reverse", "forensics"];

export default async function LeaderboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const vis = await getVisibleCompetition(user, slug).catch(() => null);
  if (!vis) notFound();
  const s = await getStandings(user, vis.competition.id);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Updated {formatDateTime(s.generatedAt, vis.competition.timezone)} · auto-refreshes every 30s</p>
        <AutoRefresh seconds={30} />
      </div>
      {s.frozen && <Alert tone="info" title="Leaderboard frozen"><span className="inline-flex items-center gap-1"><Snowflake className="h-4 w-4" />Public standings are frozen as of {formatDateTime(s.freezeAt, vis.competition.timezone)}. Final results are revealed after the event.</span></Alert>}
      {s.isStaffView && <Alert tone="info" title="Staff view">Live standings including hidden teams; participants may see a frozen or anonymized board.</Alert>}
      {s.rows.length === 0 ? (
        <EmptyState icon={Trophy} title="No participants yet" />
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle>Score progression (top 10)</CardTitle></CardHeader>
            <CardContent><ProgressionChart series={s.progression} /></CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <Table>
                <THead>
                  <TR>
                    <TH className="w-14">Rank</TH>
                    <TH>{s.competition.mode === "TEAM" ? "Team" : "Participant"}</TH>
                    <TH className="text-right">Points</TH>
                    <TH className="text-right">Solves</TH>
                    {CATS.map((c) => <TH key={c} className="hidden text-center md:table-cell"><CategoryIcon slug={c} className="mx-auto h-4 w-4" /><span className="sr-only">{c}</span></TH>)}
                    <TH className="hidden text-right lg:table-cell">Last solve</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.rows.map((r) => (
                    <TR key={r.subjectKey} className={cn(r.isMe && "bg-primary/10")}>
                      <TD className="font-mono font-semibold">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}</TD>
                      <TD className="font-medium">{r.name}{r.isMe && <span className="ml-2 text-xs text-primary">(you)</span>}</TD>
                      <TD className="text-right font-mono text-primary">{r.points}</TD>
                      <TD className="text-right font-mono">{r.solves}</TD>
                      {CATS.map((c) => <TD key={c} className="hidden text-center font-mono text-muted md:table-cell">{r.categorySolves[c] ?? 0}</TD>)}
                      <TD className="hidden text-right text-xs text-muted lg:table-cell">{r.lastSolveAt ? formatDateTime(r.lastSolveAt, vis.competition.timezone) : "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
          <p className="flex items-center gap-1 text-xs text-subtle"><Droplet className="h-3 w-3" />Ties are broken by {vis.competition.tieBreak === "EARLIEST_LAST_SOLVE" ? "the earliest time of the last solve" : "the fewest total submissions"}.</p>
        </>
      )}
    </div>
  );
}
