"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function StaffForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Assign staff</CardTitle><CardDescription>Organizers need the global ORGANIZER role; evaluators need EVALUATOR or ORGANIZER. Admins change global roles.</CardDescription></CardHeader>
      <CardContent>
        <form className="flex flex-wrap items-end gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await api(`/api/v1/competitions/${competitionId}/staff`, { method: "POST", body: { username: f.get("username"), role: f.get("role") } });
            form.reset();
            setError(null);
            router.refresh();
          } catch (err) {
            setError(errorText(err));
          }
        }}>
          <Field label="Username" htmlFor="susername"><Input id="susername" name="username" required /></Field>
          <Field label="Role" htmlFor="srole"><Select id="srole" name="role"><option value="EVALUATOR">Evaluator</option><option value="ORGANIZER">Organizer</option></Select></Field>
          <Button type="submit">Assign</Button>
        </form>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
