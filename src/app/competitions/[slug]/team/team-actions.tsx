"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCw, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function TeamSetup({ competitionId, maxSize, locked }: { competitionId: string; maxSize: number; locked: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = (path: string, body: unknown) => async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/competitions/${competitionId}/${path}`, { method: "POST", body });
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setPending(false);
    }
  };
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  if (locked) return <Alert tone="warning" title="Teams are locked">Team membership cannot change at this stage of the competition.</Alert>;
  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Create a team</CardTitle><CardDescription>You become the captain and receive an invitation code (max {maxSize} members).</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={submit("teams", { name })}>
              <Field label="Team name" htmlFor="teamName"><Input id="teamName" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40} /></Field>
              <Button type="submit" disabled={pending}>Create team</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Join a team</CardTitle><CardDescription>Ask your captain for the invitation code.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={submit("teams/join", { inviteCode: code })}>
              <Field label="Invitation code" htmlFor="code"><Input id="code" value={code} onChange={(e) => setCode(e.target.value)} required className="font-mono uppercase" maxLength={16} autoComplete="off" /></Field>
              <Button type="submit" variant="secondary" disabled={pending}>Join team</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function TeamActions(props: { competitionId: string; teamId: string; inviteCode: string; isCaptain: boolean; locked: boolean; members: { id: string; name: string }[]; selfId: string }) {
  const router = useRouter();
  const [code, setCode] = useState(props.inviteCode);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/competitions/${props.competitionId}`;
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const others = props.members.filter((m) => m.id !== props.selfId);
  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
        <span className="text-xs text-muted">Invite code</span>
        <code className="font-mono text-sm tracking-widest text-primary">{code}</code>
        <button type="button" aria-label="Copy invite code" onClick={() => navigator.clipboard.writeText(code)} className="text-muted hover:text-fg"><Copy className="h-4 w-4" /></button>
        {props.isCaptain && (
          <button type="button" aria-label="Regenerate invite code" className="text-muted hover:text-fg" onClick={() => run(async () => setCode((await api<{ inviteCode: string }>(`${base}/team/invite-code`, { method: "POST" })).inviteCode))}>
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {props.isCaptain && others.length > 0 && (
          <>
            <Select aria-label="Member" id="member-select" className="h-8 w-40 text-xs" defaultValue={others[0]!.id}>
              {others.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </Select>
            <Button size="sm" variant="secondary" onClick={() => {
              const id = (document.getElementById("member-select") as HTMLSelectElement).value;
              void run(() => api(`${base}/team/captain`, { method: "POST", body: { userId: id } }));
            }}>Make captain</Button>
            {!props.locked && (
              <Button size="sm" variant="ghost" onClick={() => {
                const id = (document.getElementById("member-select") as HTMLSelectElement).value;
                if (confirm("Remove this member from the team?")) void run(() => api(`${base}/teams/${props.teamId}/members/${id}`, { method: "DELETE" }));
              }}><UserMinus />Remove</Button>
            )}
          </>
        )}
        {!props.locked && <Button size="sm" variant="ghost" onClick={() => confirm("Leave this team?") && run(() => api(`${base}/team/leave`, { method: "POST" }))}>Leave team</Button>}
      </div>
    </div>
  );
}
