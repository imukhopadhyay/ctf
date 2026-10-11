"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function ProfileForms({ displayName, institutionId, institutions }: { displayName: string; institutionId: string | null; institutions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ which: string; tone: "success" | "danger"; text: string } | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            try {
              await api("/api/v1/auth/profile", { method: "PATCH", body: { displayName: fd.get("displayName"), institutionId: fd.get("institutionId") || null } });
              setMsg({ which: "profile", tone: "success", text: "Profile updated." });
              router.refresh();
            } catch (err) {
              setMsg({ which: "profile", tone: "danger", text: errorText(err) });
            }
          }}>
            {msg?.which === "profile" && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Field label="Display name" htmlFor="displayName"><Input id="displayName" name="displayName" defaultValue={displayName} required minLength={2} maxLength={48} /></Field>
            <Field label="Institution" htmlFor="institutionId">
              <Select id="institutionId" name="institutionId" defaultValue={institutionId ?? ""}>
                <option value="">— None —</option>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </Select>
            </Field>
            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            try {
              await api("/api/v1/auth/password", { method: "POST", body: { currentPassword: fd.get("currentPassword"), newPassword: fd.get("newPassword") } });
              setMsg({ which: "password", tone: "success", text: "Password changed. Other sessions were signed out." });
              form.reset();
            } catch (err) {
              setMsg({ which: "password", tone: "danger", text: errorText(err) });
            }
          }}>
            {msg?.which === "password" && <Alert tone={msg.tone}>{msg.text}</Alert>}
            <Field label="Current password" htmlFor="currentPassword"><Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required /></Field>
            <Field label="New password" htmlFor="newPassword" hint="At least 12 characters."><Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={12} /></Field>
            <Button type="submit" variant="secondary">Change password</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
