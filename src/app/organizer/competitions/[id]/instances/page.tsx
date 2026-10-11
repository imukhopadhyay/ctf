import { Server } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { ActionButton } from "@/components/organizer/action-button";
import { requireUser } from "@/server/auth/current";
import { competitionCan } from "@/server/services/access";
import { listCompetitionInstances } from "@/server/services/instances";
import { formatDateTime } from "@/lib/utils";

export default async function InstancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [items, canTerminate] = await Promise.all([listCompetitionInstances(user, id), competitionCan(user, id, "competition.configure")]);
  if (items.length === 0) return <EmptyState icon={Server} title="No challenge instances yet">Instances appear when participants start isolated environments.</EmptyState>;
  return (
    <Card>
      <CardHeader><CardTitle>Challenge instances (latest 200)</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <THead><TR><TH>Challenge</TH><TH>Owner</TH><TH>Status</TH><TH>Created</TH><TH>Expires</TH><TH className="text-right">Resets</TH><TH>Recent events</TH><TH className="sr-only">Actions</TH></TR></THead>
          <TBody>
            {items.map((i) => (
              <TR key={i.id}>
                <TD>{i.challenge.title}</TD>
                <TD className="font-mono text-xs">{i.user.username}<div className="text-subtle">{i.subjectKey}</div></TD>
                <TD><StatusBadge status={i.status} />{i.lastError && <p className="max-w-48 truncate text-xs text-danger" title={i.lastError}>{i.lastError}</p>}</TD>
                <TD className="text-xs text-muted">{formatDateTime(i.createdAt)}</TD>
                <TD className="text-xs text-muted">{formatDateTime(i.expiresAt)}</TD>
                <TD className="text-right font-mono">{i.resetCount}</TD>
                <TD className="text-xs text-muted">{i.events.map((e) => e.type).join(" · ")}</TD>
                <TD>{canTerminate && (i.status === "RUNNING" || i.status === "PROVISIONING") && <ActionButton size="sm" variant="ghost" path={`/api/v1/instances/${i.id}`} method="DELETE" confirmText="Terminate this instance?">Terminate</ActionButton>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}
