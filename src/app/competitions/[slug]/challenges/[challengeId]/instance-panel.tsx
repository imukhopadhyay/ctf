"use client";
import { useState } from "react";
import { Copy, Power, RotateCcw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { StatusBadge } from "@/components/status-badge";
import { Countdown } from "@/components/countdown";
import { api, errorText } from "@/lib/api-client";

interface Instance {
  id: string;
  status: string;
  connection: { host: string; port: number; protocol: string; url?: string } | null;
  expiresAt: string;
  resetCount: number;
}

export function InstancePanel({ competitionId, challengeId, initial, enabled }: { competitionId: string; challengeId: string; initial: Instance | null; enabled: boolean }) {
  const [instance, setInstance] = useState<Instance | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/v1/competitions/${competitionId}/challenges/${challengeId}/instance`;

  async function run(fn: () => Promise<Instance | null>) {
    setPending(true);
    setError(null);
    try {
      setInstance(await fn());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }

  const conn = instance?.connection;
  const address = conn ? (conn.url ?? `${conn.host} ${conn.port}`) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Server className="h-4 w-4" />Isolated environment</CardTitle>
        <CardDescription>A disposable, resource-limited target just for you{" "}/ your team. It has no internet access and expires automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {instance && instance.status === "RUNNING" ? (
          <>
            <div className="flex items-center justify-between text-sm"><StatusBadge status={instance.status} /><Countdown target={instance.expiresAt} label="Expires in" /></div>
            {address && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-bg p-2 font-mono text-sm">
                {conn?.url ? <a href={conn.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-accent hover:underline">{conn.url}</a> : <span className="flex-1 truncate">nc {conn?.host} {conn?.port}</span>}
                <button type="button" aria-label="Copy address" className="text-muted hover:text-fg" onClick={() => navigator.clipboard.writeText(conn?.url ?? `nc ${conn?.host} ${conn?.port}`)}><Copy className="h-4 w-4" /></button>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => api<Instance>(`${base}/${instance.id}/reset`, { method: "POST" }))}><RotateCcw />Reset</Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(async () => { await api(`${base}/${instance.id}`, { method: "DELETE" }); return null; })}><Power />Stop</Button>
            </div>
          </>
        ) : (
          <Button className="w-full" disabled={!enabled || pending} onClick={() => run(() => api<Instance>(base, { method: "POST" }))}>
            {pending ? "Starting… (this can take a few seconds)" : "Start environment"}
          </Button>
        )}
        {!enabled && !instance && <p className="text-xs text-muted">Environments are available to approved participants while the competition is active.</p>}
      </CardContent>
    </Card>
  );
}
