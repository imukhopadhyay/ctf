"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

const LABEL: Record<string, string> = { SCHEDULED: "Publish (schedule)", DRAFT: "Back to draft", ACTIVE: "Start / resume", PAUSED: "Pause", COMPLETED: "Complete", ARCHIVED: "Archive" };

export function LifecycleControls({ competitionId, status, allowed, problems }: { competitionId: string; status: string; allowed: string[]; problems: string[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Lifecycle: <strong className="text-fg">{status}</strong></span>
          <div className="ml-auto flex flex-wrap gap-2">
            {allowed.map((to) => (
              <Button key={to} size="sm" variant={to === "ARCHIVED" || to === "DRAFT" ? "ghost" : to === "PAUSED" ? "secondary" : "default"} disabled={pending}
                onClick={async () => {
                  if (!confirm(`Move competition to ${to}?`)) return;
                  setPending(true);
                  setError(null);
                  try {
                    await api(`/api/v1/competitions/${competitionId}/status`, { method: "POST", body: { to } });
                    router.refresh();
                  } catch (e) {
                    setError(errorText(e));
                  } finally {
                    setPending(false);
                  }
                }}>
                {LABEL[to] ?? to}
              </Button>
            ))}
          </div>
        </div>
        {problems.length > 0 && (
          <Alert tone="warning" title="Not ready to publish">
            <ul className="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          </Alert>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </CardContent>
    </Card>
  );
}
