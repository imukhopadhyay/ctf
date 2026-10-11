"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function UserRowActions({ id, role, status, self }: { id: string; role: string; status: string; self: boolean }) {
  const router = useRouter();
  const update = async (body: Record<string, string>, confirmText: string) => {
    if (!confirm(confirmText)) return router.refresh();
    try {
      await api(`/api/v1/admin/users/${id}`, { method: "PATCH", body });
    } catch (e) {
      alert(errorText(e));
    }
    router.refresh();
  };
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Role" className="h-8 w-36 text-xs" defaultValue={role} disabled={self} onChange={(e) => update({ role: e.target.value }, `Change role to ${e.target.value}? Their sessions will be revoked.`)}>
        {["ADMIN", "ORGANIZER", "EVALUATOR", "PARTICIPANT"].map((r) => <option key={r}>{r}</option>)}
      </Select>
      {!self && (status === "ACTIVE"
        ? <Button size="sm" variant="ghost" onClick={() => update({ status: "SUSPENDED" }, "Suspend this account? All sessions are revoked.")}>Suspend</Button>
        : <Button size="sm" variant="ghost" onClick={() => update({ status: "ACTIVE" }, "Reactivate this account?")}>Reactivate</Button>)}
    </div>
  );
}

export function CreateUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Create account (e.g. organizer)</Button>;
  return (
    <Card>
      <CardHeader><CardTitle>Create account</CardTitle></CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-3" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await api("/api/v1/admin/users", { method: "POST", body: Object.fromEntries(f.entries()) });
            setMsg({ tone: "success", text: "Account created. Share the initial password securely and ask the user to change it." });
            form.reset();
            router.refresh();
          } catch (err) {
            setMsg({ tone: "danger", text: errorText(err) });
          }
        }}>
          {msg && <Alert tone={msg.tone} className="md:col-span-3">{msg.text}</Alert>}
          <Field label="Email" htmlFor="cemail"><Input id="cemail" name="email" type="email" required /></Field>
          <Field label="Username" htmlFor="cusername"><Input id="cusername" name="username" required /></Field>
          <Field label="Display name" htmlFor="cdisplay"><Input id="cdisplay" name="displayName" required /></Field>
          <Field label="Role" htmlFor="crole"><Select id="crole" name="role" defaultValue="ORGANIZER">{["ORGANIZER", "EVALUATOR", "PARTICIPANT", "ADMIN"].map((r) => <option key={r}>{r}</option>)}</Select></Field>
          <Field label="Initial password" htmlFor="cpass"><Input id="cpass" name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
          <div className="flex items-end gap-2"><Button type="submit">Create</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
