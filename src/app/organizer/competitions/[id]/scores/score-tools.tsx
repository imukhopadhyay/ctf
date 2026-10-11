"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

interface Delta { subjectKey: string; current: number; expected: number; delta: number }

export function ScoreTools({ competitionId, subjects }: { competitionId: string; subjects: { key: string; name: string }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [deltas, setDeltas] = useState<Delta[] | null>(null);
  const names = new Map(subjects.map((s) => [s.key, s.name]));
  const recalc = async (apply: boolean) => {
    try {
      const r = await api<{ deltas: Delta[] }>(`/api/v1/competitions/${competitionId}/scores/recalculate`, { method: "POST", body: { apply } });
      setDeltas(apply ? null : r.deltas);
      setMsg({ tone: apply ? "success" : "info", text: apply ? `Applied ${r.deltas.length} correction event(s).` : r.deltas.length ? `${r.deltas.length} subject(s) would change.` : "Ledger is consistent — nothing to change." });
      if (apply) router.refresh();
    } catch (e) {
      setMsg({ tone: "danger", text: errorText(e) });
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {msg && <Alert tone={msg.tone} className="lg:col-span-2">{msg.text}</Alert>}
      <Card>
        <CardHeader><CardTitle>Manual adjustment</CardTitle><CardDescription>For dispute resolution or penalties. Requires a reason; recorded in the audit log.</CardDescription></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            try {
              await api(`/api/v1/competitions/${competitionId}/scores/adjust`, { method: "POST", body: { subjectKey: f.get("subjectKey"), points: Number(f.get("points")), reason: f.get("reason") } });
              setMsg({ tone: "success", text: "Adjustment recorded." });
              form.reset();
              router.refresh();
            } catch (err) {
              setMsg({ tone: "danger", text: errorText(err) });
            }
          }}>
            <Field label="Participant / team" htmlFor="subjectKey"><Select id="subjectKey" name="subjectKey" required>{subjects.map((s) => <option key={s.key} value={s.key}>{s.name}</option>)}</Select></Field>
            <Field label="Points (negative to deduct)" htmlFor="points"><Input id="points" name="points" type="number" required /></Field>
            <Field label="Reason" htmlFor="reason"><Input id="reason" name="reason" required minLength={5} maxLength={500} /></Field>
            <Button type="submit">Record adjustment</Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recalculate</CardTitle><CardDescription>Recompute expected scores from solves, current point values, hint costs and penalty settings. Differences are appended as RECALCULATION events. Idempotent.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2"><Button variant="secondary" onClick={() => recalc(false)}>Preview</Button><Button onClick={() => confirm("Apply recalculation?") && recalc(true)}>Apply</Button></div>
          {deltas && deltas.length > 0 && (
            <ul className="space-y-1 text-sm">{deltas.map((d) => <li key={d.subjectKey} className="flex justify-between"><span>{names.get(d.subjectKey) ?? d.subjectKey}</span><span className="font-mono">{d.current} → {d.expected} ({d.delta > 0 ? "+" : ""}{d.delta})</span></li>)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
