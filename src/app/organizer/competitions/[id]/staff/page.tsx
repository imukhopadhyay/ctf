import { Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/organizer/action-button";
import { requireUser } from "@/server/auth/current";
import { competitionCan } from "@/server/services/access";
import { listStaff } from "@/server/services/competitions";
import { StaffForm } from "./staff-form";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [staff, canManage] = await Promise.all([listStaff(user, id), competitionCan(user, id, "competition.staff.manage")]);
  return (
    <div className="space-y-4">
      {canManage && <StaffForm competitionId={id} />}
      <Card>
        <CardHeader><CardTitle>Competition staff</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <THead><TR><TH>User</TH><TH>Global role</TH><TH>Competition role</TH><TH className="sr-only">Actions</TH></TR></THead>
            <TBody>
              {staff.map((s) => (
                <TR key={s.id}>
                  <TD>{s.user.displayName} <span className="font-mono text-xs text-subtle">@{s.user.username}</span></TD>
                  <TD className="text-xs text-muted">{s.user.role.toLowerCase()}</TD>
                  <TD><Badge tone={s.role === "ORGANIZER" ? "primary" : "info"}>{s.role.toLowerCase()}</Badge></TD>
                  <TD className="text-right">{canManage && <ActionButton size="icon" variant="ghost" aria-label="Remove" path={`/api/v1/competitions/${id}/staff/${s.id}`} method="DELETE" confirmText="Remove this staff assignment?"><Trash2 /></ActionButton>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
