"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function AnnouncementForm({ competitionId }: { competitionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>New announcement</CardTitle></CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await api(`/api/v1/competitions/${competitionId}/announcements`, { method: "POST", body: { title: f.get("title"), body: f.get("body"), pinned: f.get("pinned") === "on" } });
            form.reset();
            setError(null);
            router.refresh();
          } catch (err) {
            setError(errorText(err));
          }
        }}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Title" htmlFor="atitle"><Input id="atitle" name="title" required minLength={3} maxLength={140} /></Field>
          <Field label="Message (Markdown)" htmlFor="abody"><Textarea id="abody" name="body" required rows={4} /></Field>
          <Checkbox name="pinned" label="Pin to top" />
          <Button type="submit">Publish & notify participants</Button>
        </form>
      </CardContent>
    </Card>
  );
}
