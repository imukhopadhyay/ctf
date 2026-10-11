"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { api, errorText } from "@/lib/api-client";

interface Props {
  competition: { id: string; slug: string; mode: string; accessMode: string; status: string };
  loggedIn: boolean;
  isStaff: boolean;
  registrationOpen: boolean;
  participation: { status: string | null; teamId: string | null } | null;
}

export function RegistrationPanel({ competition: c, loggedIn, isStaff, registrationOpen, participation }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const status = participation?.status;

  async function act(method: "POST" | "DELETE") {
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/competitions/${c.id}/register`, { method, body: method === "POST" ? { inviteCode: code || undefined } : undefined });
      router.refresh();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Participation</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {isStaff ? (
          <p className="text-sm text-muted">You are staff on this competition.</p>
        ) : !loggedIn ? (
          <Button asChild className="w-full"><Link href={`/login?next=/competitions/${c.slug}`}>Sign in to register</Link></Button>
        ) : status === "APPROVED" ? (
          <>
            <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-4 w-4" /> You are registered.</p>
            {c.mode === "TEAM" && !participation?.teamId && (
              <Alert tone="warning" title="Team required">Create or join a team before submitting flags.</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><Link href={`/competitions/${c.slug}/challenges`}>Open challenges</Link></Button>
              {c.mode === "TEAM" && <Button asChild size="sm" variant="secondary"><Link href={`/competitions/${c.slug}/team`}>{participation?.teamId ? "My team" : "Set up team"}</Link></Button>}
            </div>
            {!participation?.teamId && (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => confirm("Withdraw your registration?") && act("DELETE")}>Withdraw</Button>
            )}
          </>
        ) : status === "PENDING" ? (
          <p className="flex items-center gap-2 text-sm text-warning"><Clock className="h-4 w-4" /> Awaiting organizer approval.</p>
        ) : status === "REJECTED" ? (
          <p className="flex items-center gap-2 text-sm text-danger"><XCircle className="h-4 w-4" /> Registration declined by the organizers.</p>
        ) : registrationOpen ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void act("POST");
            }}
          >
            {c.accessMode === "INVITATION" && (
              <Field label="Invitation code" htmlFor="invite">
                <Input id="invite" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={64} autoComplete="off" />
              </Field>
            )}
            {c.accessMode === "PRIVATE" && <p className="text-xs text-muted">Organizers review registrations for this competition.</p>}
            <Button type="submit" className="w-full" disabled={pending}>{pending ? "Registering…" : "Register"}</Button>
          </form>
        ) : (
          <p className="text-sm text-muted">Registration is closed.</p>
        )}
      </CardContent>
    </Card>
  );
}
