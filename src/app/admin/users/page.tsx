import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { requirePlatformPermission } from "@/server/auth/current";
import { listUsers } from "@/server/services/admin";
import { formatDateTime } from "@/lib/utils";
import { UserRowActions, CreateUserForm } from "./user-actions";

export const metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePlatformPermission("platform.users.manage");
  const sp = await searchParams;
  const res = await listUsers(user, { q: sp.q, role: sp.role as never, status: sp.status as never, page: Number(sp.page ?? 1) || 1 });
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  return (
    <div className="space-y-4">
      <PageHeader title="Users" description={`${res.total} accounts`} />
      <CreateUserForm />
      <form className="flex flex-wrap gap-2" action="/admin/users">
        <Input name="q" defaultValue={sp.q} placeholder="Search username, email, name" className="max-w-xs" aria-label="Search" />
        <Select name="role" defaultValue={sp.role ?? ""} className="w-40" aria-label="Role"><option value="">All roles</option>{["ADMIN", "ORGANIZER", "EVALUATOR", "PARTICIPANT"].map((r) => <option key={r}>{r}</option>)}</Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-40" aria-label="Status"><option value="">All statuses</option><option>ACTIVE</option><option>SUSPENDED</option></Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>
      <Card><CardContent className="pt-4">
        <Table>
          <THead><TR><TH>User</TH><TH>Email</TH><TH>Institution</TH><TH>Status</TH><TH>Last login</TH><TH>Role / actions</TH></TR></THead>
          <TBody>
            {res.items.map((u) => (
              <TR key={u.id}>
                <TD>{u.displayName}<div className="font-mono text-xs text-subtle">@{u.username}</div></TD>
                <TD className="text-xs text-muted">{u.email}</TD>
                <TD className="text-xs text-muted">{u.institution?.name ?? "—"}</TD>
                <TD><StatusBadge status={u.status === "ACTIVE" ? "ACTIVE" : "REJECTED"} /></TD>
                <TD className="text-xs text-muted">{formatDateTime(u.lastLoginAt)}</TD>
                <TD><UserRowActions id={u.id} role={u.role} status={u.status} self={u.id === user.id} /></TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <div className="mt-3 flex justify-between text-sm text-muted">
          <span>Page {res.page} of {pages}</span>
          <span className="space-x-3">
            {res.page > 1 && <Link className="text-accent" href={{ query: { ...sp, page: res.page - 1 } }}>← Previous</Link>}
            {res.page < pages && <Link className="text-accent" href={{ query: { ...sp, page: res.page + 1 } }}>Next →</Link>}
          </span>
        </div>
      </CardContent></Card>
    </div>
  );
}
