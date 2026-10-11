import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { SimpleBarChart } from "@/components/charts";
import { requireUser } from "@/server/auth/current";
import { platformOverview } from "@/server/services/analytics";
import { runnerHealth } from "@/server/services/instances";
import { formatBytes } from "@/lib/utils";

export const metadata = { title: "Administration" };

export default async function AdminOverview() {
  const user = await requireUser();
  const [o, runner] = await Promise.all([platformOverview(user), runnerHealth(user)]);
  const sec = (s: string) => o.security24h.find((x) => x.severity === s)?.count ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="administration" title="Platform health" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={o.usersByRole.reduce((a, u) => a + u.count, 0)} />
        <Stat label="Submissions (24h)" value={o.submissions24h} sub={`${o.solves} solves all-time`} />
        <Stat label="Security events (24h)" value={o.security24h.reduce((a, s) => a + s.count, 0)} sub={`${sec("HIGH") + sec("CRITICAL")} high/critical`} />
        <Stat label="Active instances" value={o.activeInstances} />
        <Stat label="Artifact storage" value={formatBytes(o.artifacts.storedBytes)} sub={`${o.artifacts.storedObjects} blobs · ${o.artifacts.records} records`} />
        <Stat label="Background jobs" value={o.jobs.find((j) => j.status === "PENDING")?.count ?? 0} sub={`pending · ${o.jobs.find((j) => j.status === "FAILED")?.count ?? 0} failed`} />
        <Stat label="Challenge runner" value={!runner.configured ? "disabled" : runner.health ? (runner.health.ok ? "ok" : "degraded") : "unreachable"} sub={!runner.configured ? "RUNNER_URL not set" : runner.health ? `${runner.health.backend} · ${runner.health.activeInstances}/${runner.health.maxInstances}` : runner.error} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Users by role</CardTitle></CardHeader><CardContent><SimpleBarChart data={o.usersByRole} xKey="role" bars={[{ key: "count", label: "Users" }]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Competitions by status</CardTitle></CardHeader><CardContent><SimpleBarChart data={o.competitionsByStatus} xKey="status" bars={[{ key: "count", label: "Competitions" }]} /></CardContent></Card>
      </div>
      {runner.configured && runner.health && (
        <Card><CardHeader><CardTitle>Runner isolation report</CardTitle></CardHeader><CardContent><pre className="overflow-auto rounded bg-bg p-3 font-mono text-xs">{JSON.stringify(runner.health.isolation, null, 2)}</pre></CardContent></Card>
      )}
    </div>
  );
}
