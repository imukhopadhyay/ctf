import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requirePlatformPermission } from "@/server/auth/current";
import { getSettings } from "@/server/services/settings";
import { listInstitutions, listEnvironments } from "@/server/services/admin";
import { listAchievementsAdmin } from "@/server/services/achievements";
import { SettingsForm, EnvironmentForm, InstitutionForm, AchievementForm, EnvironmentToggle } from "./forms";

export const metadata = { title: "Platform settings" };

export default async function SettingsPage() {
  const user = await requirePlatformPermission("platform.settings.manage");
  const [settings, institutions, environments, achievements] = await Promise.all([getSettings(), listInstitutions(), listEnvironments(user), listAchievementsAdmin(user)]);
  return (
    <div className="space-y-6">
      <PageHeader title="Platform settings" />
      <SettingsForm initial={settings} />
      <Card>
        <CardHeader><CardTitle>Approved execution environments</CardTitle><CardDescription>Only images listed here (and allow-listed by the runner via RUNNER_ALLOWED_IMAGES) can be started. New environments are disabled until explicitly enabled.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead><TR><TH>Key</TH><TH>Image</TH><TH>Protocol</TH><TH>Limits</TH><TH>TTL</TH><TH>Used by</TH><TH>Enabled</TH></TR></THead>
            <TBody>
              {environments.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.key}<div className="text-muted">{e.name}</div></TD>
                  <TD className="font-mono text-xs">{e.image}</TD>
                  <TD className="text-xs">{e.protocol}:{e.internalPort}</TD>
                  <TD className="text-xs text-muted">{e.memoryMb} MB · {e.cpuMillis / 1000} CPU · {e.pidsLimit} pids</TD>
                  <TD className="text-xs">{e.ttlMinutes} min</TD>
                  <TD className="font-mono text-xs">{e._count.challenges}</TD>
                  <TD><EnvironmentToggle env={e} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <EnvironmentForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Achievements</CardTitle><CardDescription>Badge criteria are configurable JSON rules (validated server-side).</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead><TR><TH>Badge</TH><TH>Scope</TH><TH>Criteria</TH><TH className="text-right">XP</TH><TH className="text-right">Awarded</TH><TH>Status</TH></TR></THead>
            <TBody>
              {achievements.map((a) => (
                <TR key={a.id}>
                  <TD>{a.name}<div className="font-mono text-xs text-subtle">{a.key}</div></TD>
                  <TD className="text-xs">{a.scope.toLowerCase()}</TD>
                  <TD><code className="font-mono text-[11px] text-muted">{JSON.stringify(a.criteria)}</code></TD>
                  <TD className="text-right font-mono">{a.xp}</TD>
                  <TD className="text-right font-mono">{a._count.users + a._count.teams}</TD>
                  <TD>{a.enabled ? <Badge tone="success">enabled</Badge> : <Badge tone="muted">disabled</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <AchievementForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Institutions</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-1 text-sm">{institutions.map((i) => <li key={i.id} className="flex justify-between"><span>{i.name} <span className="font-mono text-xs text-subtle">{i.slug}</span></span><span className="text-xs text-muted">{i._count.users} users · {i._count.competitions} competitions</span></li>)}</ul>
          <InstitutionForm />
        </CardContent>
      </Card>
    </div>
  );
}
