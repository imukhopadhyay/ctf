"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

export function InviteCodeForm({ competitionId, hasCode }: { competitionId: string; hasCode: boolean }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  return (
    <Card>
      <CardHeader><CardTitle>Invitation code</CardTitle><CardDescription>{hasCode ? "A code is set. Only its keyed hash is stored, so it cannot be displayed — set a new one to replace it." : "No code set yet; required for publication."}</CardDescription></CardHeader>
      <CardContent>
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/api/v1/competitions/${competitionId}/invite-code`, { method: "POST", body: { code } });
            setMsg({ tone: "success", text: `Invitation code set. Share "${code}" with invited participants.` });
          } catch (err) {
            setMsg({ tone: "danger", text: errorText(err) });
          }
        }}>
          <Input aria-label="New invitation code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SPRING-2026" pattern="[A-Za-z0-9-]{6,64}" required className="font-mono" />
          <Button type="submit">Set code</Button>
        </form>
        {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      </CardContent>
    </Card>
  );
}
