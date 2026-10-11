"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";

interface Item { id: string; writeup: string | null; createdAt: string; challenge: { title: string; points: number }; user: { displayName: string; username: string }; team: { name: string } | null }

export function GradingQueue({ items }: { items: Item[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {items.map((s) => (
        <Card key={s.id}>
          <CardHeader>
            <CardTitle>{s.challenge.title} <span className="font-mono text-sm text-muted">(max {s.challenge.points})</span></CardTitle>
            <p className="text-xs text-subtle">{s.user.displayName} @{s.user.username}{s.team ? ` · ${s.team.name}` : ""} · {formatDateTime(s.createdAt)}</p>
          </CardHeader>
          <CardContent>
            {/* Rendered as plain text: write-ups are untrusted participant input. */}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg p-3 text-sm">{s.writeup}</pre>
            <form className="mt-3 grid gap-3 md:grid-cols-[120px_1fr_auto_auto]" onSubmit={(e) => e.preventDefault()}>
              <Field label="Points" htmlFor={`p-${s.id}`}><Input id={`p-${s.id}`} type="number" min={0} max={s.challenge.points} defaultValue={s.challenge.points} /></Field>
              <Field label="Feedback" htmlFor={`f-${s.id}`}><Textarea id={`f-${s.id}`} rows={1} className="min-h-9" /></Field>
              {[true, false].map((accept) => (
                <Button key={String(accept)} className="self-end" variant={accept ? "default" : "danger"} onClick={async () => {
                  const points = Number((document.getElementById(`p-${s.id}`) as HTMLInputElement).value);
                  const feedback = (document.getElementById(`f-${s.id}`) as HTMLTextAreaElement).value;
                  try {
                    await api(`/api/v1/submissions/${s.id}/grade`, { method: "POST", body: { accept, points, feedback } });
                    router.refresh();
                  } catch (err) {
                    setError(errorText(err));
                  }
                }}>{accept ? "Accept" : "Reject"}</Button>
              ))}
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
