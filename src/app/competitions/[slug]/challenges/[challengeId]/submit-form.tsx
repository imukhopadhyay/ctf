"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, PartyPopper, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

interface Outcome {
  status: string;
  message: string;
  pointsAwarded?: number;
  firstBlood?: boolean;
  attemptsUsed?: number;
  attemptLimit?: number | null;
  retryAfterSeconds?: number;
  scoreEvent?: { points: number; reason: string };
}

export function SubmitFlagForm(props: { competitionId: string; challengeId: string; solved: boolean; disabled: boolean; disabledReason?: string; attemptsUsed: number; attemptLimit: number | null }) {
  const router = useRouter();
  const [flag, setFlag] = useState("");
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (props.solved && outcome?.status !== "correct") {
    return (
      <Card className="border-success/40 bg-success/5">
        <CardContent className="flex items-center gap-3 pt-5 text-success"><CheckCircle2 className="h-6 w-6" /><span className="font-medium">Solved — nice work.</span></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="h-4 w-4" />Submit flag</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {outcome?.status === "correct" ? (
          <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center" role="status" aria-live="polite">
            <PartyPopper className="mx-auto h-8 w-8 text-success motion-safe:animate-bounce" />
            <p className="mt-2 text-lg font-semibold text-success">{outcome.message}</p>
            <p className="font-mono text-2xl font-bold">+{outcome.pointsAwarded}</p>
            {outcome.firstBlood && <p className="mt-1 text-sm text-warning">🩸 First blood!</p>}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              setError(null);
              try {
                const res = await api<Outcome>(`/api/v1/competitions/${props.competitionId}/challenges/${props.challengeId}/submit`, { method: "POST", body: { flag } });
                setOutcome(res);
                if (res.status === "correct" || res.status === "already_solved") router.refresh();
                if (res.status === "incorrect") setFlag("");
              } catch (err) {
                setError(errorText(err));
              } finally {
                setPending(false);
              }
            }}
          >
            <label htmlFor="flag" className="sr-only">Flag</label>
            <Input id="flag" value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="CQ{...}" className="font-mono" maxLength={512} autoComplete="off" spellCheck={false} disabled={props.disabled || pending} required />
            <Button type="submit" className="w-full" disabled={props.disabled || pending || !flag.trim()}>{pending ? "Checking…" : "Submit"}</Button>
            {props.disabled && props.disabledReason && <p className="text-xs text-muted">{props.disabledReason}</p>}
          </form>
        )}
        {outcome && outcome.status !== "correct" && (
          <Alert tone={outcome.status === "incorrect" ? "danger" : "warning"}>
            <span className="flex items-center gap-1">{outcome.status === "incorrect" && <XCircle className="h-4 w-4" />}{outcome.message}</span>
            {outcome.retryAfterSeconds ? <span> Try again in {outcome.retryAfterSeconds}s.</span> : null}
            {outcome.scoreEvent && outcome.scoreEvent.points < 0 && <span> Penalty: {outcome.scoreEvent.points} points.</span>}
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {props.attemptLimit !== null && (
          <p className="text-xs text-muted">Incorrect attempts: {outcome?.attemptsUsed ?? props.attemptsUsed} / {props.attemptLimit}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function WriteupForm(props: { competitionId: string; challengeId: string; solved: boolean; disabled: boolean }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger" | "warning"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  if (props.solved) return <Alert tone="success" title="Write-up accepted">An evaluator accepted your submission.</Alert>;
  return (
    <Card>
      <CardHeader><CardTitle>Submit write-up</CardTitle></CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const res = await api<{ status: string; message: string }>(`/api/v1/competitions/${props.competitionId}/challenges/${props.challengeId}/writeup`, { method: "POST", body: { writeup: text } });
              setMsg({ tone: res.status === "pending_review" ? "success" : "warning", text: res.message });
              if (res.status === "pending_review") setText("");
            } catch (err) {
              setMsg({ tone: "danger", text: errorText(err) });
            } finally {
              setPending(false);
            }
          }}
        >
          <label htmlFor="writeup" className="sr-only">Write-up</label>
          <Textarea id="writeup" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe your findings, evidence and reasoning (Markdown supported)…" minLength={20} maxLength={20000} disabled={props.disabled} required />
          <Button type="submit" className="w-full" disabled={props.disabled || pending}>{pending ? "Submitting…" : "Submit for evaluation"}</Button>
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </form>
      </CardContent>
    </Card>
  );
}
