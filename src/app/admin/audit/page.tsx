import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePlatformPermission } from "@/server/auth/current";
import { listAuditLogs } from "@/server/services/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePlatformPermission("platform.audit.view");
  const sp = await searchParams;
  const res = await listAuditLogs(user, { action: sp.action, actor: sp.actor, page: Number(sp.page ?? 1) || 1 });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Administrative, scoring and security-sensitive actions. Metadata is scrubbed of secrets; IPs are stored only as keyed hashes."
        actions={<Button asChild variant="secondary"><a href="/api/v1/admin/export/audit"><Download />Export CSV</a></Button>} />
      <form className="flex flex-wrap gap-2" action="/admin/audit">
        <Input name="action" defaultValue={sp.action} placeholder="Action prefix (e.g. score.)" className="max-w-xs" aria-label="Action prefix" />
        <Input name="actor" defaultValue={sp.actor} placeholder="Actor username" className="max-w-xs" aria-label="Actor" />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card><CardContent className="pt-4">
        <Table>
          <THead><TR><TH>When</TH><TH>Actor</TH><TH>Action</TH><TH>Target</TH><TH>Competition</TH><TH>Details</TH></TR></THead>
          <TBody>
            {res.items.map((a) => (
              <TR key={a.id}>
                <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(a.createdAt)}</TD>
                <TD className="font-mono text-xs">{a.actor?.username ?? "system"}</TD>
                <TD className="font-mono text-xs text-primary">{a.action}</TD>
                <TD className="font-mono text-xs text-muted">{a.targetType ? `${a.targetType}:${a.targetId?.slice(0, 10)}` : "—"}</TD>
                <TD className="text-xs">{a.competition?.name ?? "—"}</TD>
                <TD><code className="block max-w-md truncate font-mono text-[11px] text-subtle" title={JSON.stringify(a.metadata)}>{JSON.stringify(a.metadata)}</code></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="mt-3 flex justify-between text-sm text-muted">
          <span>{res.total} entries · page {res.page} of {pages}</span>
          <span className="space-x-3">
            {res.page > 1 && <Link className="text-accent" href={{ query: { ...sp, page: res.page - 1 } }}>← Newer</Link>}
            {res.page < pages && <Link className="text-accent" href={{ query: { ...sp, page: res.page + 1 } }}>Older →</Link>}
          </span>
        </div>
      </CardContent></Card>
    </div>
  );
}
