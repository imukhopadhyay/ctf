import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton } from "@/components/organizer/action-button";
import { requirePlatformPermission } from "@/server/auth/current";
import { listSecurityEvents } from "@/server/services/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Security monitoring" };
const SEV = { INFO: "muted", LOW: "info", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger" } as const;

export default async function SecurityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePlatformPermission("platform.security.view");
  const sp = await searchParams;
  const res = await listSecurityEvents(user, { type: sp.type, unacknowledged: sp.unacknowledged as never, page: Number(sp.page ?? 1) || 1 });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  return (
    <div className="space-y-4">
      <PageHeader title="Security monitoring" description="Rate-limit hits, failed logins, lockouts, access denials, CSRF rejections, suspected flag sharing and unsafe uploads." />
      <Card>
        <CardHeader><CardTitle>Last 24 hours</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {res.last24h.length === 0 ? <span className="text-sm text-muted">No events.</span> : res.last24h.map((t) => <Link key={t.type} href={`/admin/security?type=${t.type}`}><Badge tone="default">{t.type}: {t.count}</Badge></Link>)}
        </CardContent>
      </Card>
      <form className="flex gap-2" action="/admin/security">
        <Select name="type" defaultValue={sp.type ?? ""} className="w-64" aria-label="Type">
          <option value="">All types</option>
          {["RATE_LIMIT", "LOGIN_FAILURE", "ACCOUNT_LOCKED", "ACCESS_DENIED", "CSRF_REJECTED", "FLAG_SHARING_SUSPECTED", "SUBMISSION_LIMIT", "UNSAFE_UPLOAD_REJECTED", "INSTANCE_FAILURE"].map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Select name="unacknowledged" defaultValue={sp.unacknowledged ?? ""} className="w-48" aria-label="Acknowledgement"><option value="">All</option><option value="true">Unacknowledged</option></Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card><CardContent className="pt-4">
        <Table>
          <THead><TR><TH>When</TH><TH>Severity</TH><TH>Type</TH><TH>Competition</TH><TH>Details</TH><TH className="sr-only">Actions</TH></TR></THead>
          <TBody>
            {res.items.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.createdAt)}</TD>
                <TD><Badge tone={SEV[e.severity]}>{e.severity.toLowerCase()}</Badge></TD>
                <TD className="font-mono text-xs">{e.type}</TD>
                <TD className="text-xs">{e.competition?.name ?? "—"}</TD>
                <TD><code className="block max-w-md truncate font-mono text-[11px] text-subtle" title={JSON.stringify(e.details)}>{JSON.stringify(e.details)}</code></TD>
                <TD className="text-right">{e.acknowledgedAt ? <span className="text-xs text-subtle">ack&rsquo;d</span> : <ActionButton size="sm" variant="ghost" path={`/api/v1/admin/security/${e.id}/ack`}>Acknowledge</ActionButton>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="mt-3 flex justify-between text-sm text-muted">
          <span>{res.total} events · page {res.page} of {pages}</span>
          <span className="space-x-3">
            {res.page > 1 && <Link className="text-accent" href={{ query: { ...sp, page: res.page - 1 } }}>← Newer</Link>}
            {res.page < pages && <Link className="text-accent" href={{ query: { ...sp, page: res.page + 1 } }}>Older →</Link>}
          </span>
        </div>
      </CardContent></Card>
    </div>
  );
}
