"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { Markdown } from "@/components/markdown";
import { api, errorText } from "@/lib/api-client";

interface Hint {
  id: string;
  order: number;
  title: string;
  cost: number;
  unlocked: boolean;
  content: string | null;
  minAttempts: number;
  availableAfter: string | null;
}

export function HintsPanel({ competitionId, challengeId, hints, canUnlock }: { competitionId: string; challengeId: string; hints: Hint[]; canUnlock: boolean }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  if (hints.length === 0) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-warning" />Hints</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {hints.map((h) => {
          const content = h.content ?? revealed[h.id];
          return (
            <div key={h.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{h.order}. {h.title}</span>
                {h.cost > 0 && !content && <span className="font-mono text-xs text-warning">−{h.cost} pts</span>}
              </div>
              {content ? (
                <div className="mt-2"><Markdown>{content}</Markdown></div>
              ) : (
                <div className="mt-2 space-y-2">
                  {h.minAttempts > 0 && <p className="text-xs text-muted">Available after {h.minAttempts} incorrect attempt(s).</p>}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!canUnlock || pending === h.id}
                    onClick={async () => {
                      if (h.cost > 0 && !confirm(`Unlocking this hint deducts ${h.cost} points. Continue?`)) return;
                      setPending(h.id);
                      setError(null);
                      try {
                        const res = await api<{ hint: { content: string } }>(`/api/v1/competitions/${competitionId}/challenges/${challengeId}/hints/${h.id}/unlock`, { method: "POST" });
                        setRevealed((r) => ({ ...r, [h.id]: res.hint.content }));
                        router.refresh();
                      } catch (e) {
                        setError(errorText(e));
                      } finally {
                        setPending(null);
                      }
                    }}
                  >
                    <Lock /> {pending === h.id ? "Unlocking…" : "Unlock hint"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
