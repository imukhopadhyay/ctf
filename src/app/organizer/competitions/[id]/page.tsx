import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SimpleBarChart, TrendChart } from "@/components/charts";
import { DifficultyBadge, StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/auth/current";
import { competitionAnalytics } from "@/server/services/analytics";
import { competitionCan } from "@/server/services/access";
import { publicationProblems } from "@/server/services/competitions";
import { allowedTransitions } from "@/server/domain/competition-state";
import { LifecycleControls } from "./lifecycle-controls";

export default async function OrganizerOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const a = await competitionAnalytics(user, id);
  const canConfigure = await competitionCan(user, id, "competition.configure");
  const problems = a.competition.status === "DRAFT" ? await publicationProblems(id) : [];
  return (
    <div className="space-y-6">
      {canConfigure && <LifecycleControls competitionId={id} status={a.competition.status} allowed={[...allowedTransitions(a.competition.status)]} problems={problems} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Participants" value={a.participants.approved} sub={a.participants.pending ? `${a.participants.pending} pending approval` : undefined} />
        {a.competition.mode === "TEAM" && <Stat label="Teams" value={a.participants.teams} />}
        <Stat label="Total solves" value={a.totalSolves} />
        <Stat label="Submissions" value={a.submissions.total} sub={`${(a.submissions.acceptanceRate * 100).toFixed(1)}% acceptance`} />
        <Stat label="Awaiting grading" value={a.submissions.pendingReview} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Participation trend</CardTitle></CardHeader><CardContent><TrendChart data={a.trend} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Solves by category</CardTitle></CardHeader><CardContent><SimpleBarChart data={a.byCategory} xKey="category" bars={[{ key: "solves", label: "Solves" }, { key: "challenges", label: "Challenges" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Score distribution</CardTitle></CardHeader><CardContent><SimpleBarChart data={a.scoreHistogram} xKey="range" bars={[{ key: "count", label: "Subjects" }]} /></CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Difficulty & publication</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <SimpleBarChart data={a.difficulty} xKey="difficulty" bars={[{ key: "count", label: "Challenges" }]} height={200} />
            <SimpleBarChart data={a.statusCounts.filter((s) => s.count > 0)} xKey="status" bars={[{ key: "count", label: "Challenges" }]} height={200} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div><CardTitle>Challenges</CardTitle><CardDescription>Abandonment = share of subjects who attempted but have not solved.</CardDescription></div>
          <Button asChild size="sm"><Link href={`/organizer/competitions/${id}/challenges/new`}><Plus />New challenge</Link></Button>
        </CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>Title</TH><TH>Category</TH><TH>Difficulty</TH><TH>Status</TH><TH className="text-right">Points</TH><TH className="text-right">Solves</TH><TH className="text-right">Attempted</TH><TH className="text-right">Abandonment</TH></TR></THead>
            <TBody>
              {a.perChallenge.map((c) => (
                <TR key={c.id}>
                  <TD><Link href={`/organizer/challenges/${c.id}`} className="font-medium hover:text-primary">{c.title}</Link></TD>
                  <TD className="text-muted">{c.category}</TD>
                  <TD><DifficultyBadge difficulty={c.difficulty} /></TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD className="text-right font-mono">{c.points}</TD>
                  <TD className="text-right font-mono">{c.solves}</TD>
                  <TD className="text-right font-mono">{c.attempters}</TD>
                  <TD className="text-right font-mono">{c.attempters ? `${Math.round(c.abandonmentRate * 100)}%` : "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Most solved</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{a.mostSolved.map((c) => <div key={c.id} className="flex justify-between"><span>{c.title}</span><span className="font-mono">{c.solves}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Least solved</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">{a.leastSolved.map((c) => <div key={c.id} className="flex justify-between"><span>{c.title}</span><span className="font-mono">{c.solves}</span></div>)}</CardContent></Card>
        <Card>
          <CardHeader><CardTitle>Security & instances</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            {a.security.length === 0 && a.instances.length === 0 && <p className="text-muted">No events.</p>}
            {a.security.map((s) => <div key={s.type} className="flex justify-between"><span className="font-mono text-xs">{s.type}</span><span>{s.count}</span></div>)}
            {a.instances.map((s) => <div key={s.status} className="flex justify-between"><span>instances {s.status.toLowerCase()}</span><span>{s.count}</span></div>)}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>Reports</CardTitle><CardDescription>CSV exports (spreadsheet-formula safe). Submitted flag values are never stored and cannot be exported. Use your browser&apos;s print function on any page for a printable report.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {["standings", "submissions", "score-events", "challenges"].map((k) => (
            <Button key={k} asChild variant="secondary" size="sm"><a href={`/api/v1/competitions/${id}/export/${k}`}><Download />{k}.csv</a></Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
