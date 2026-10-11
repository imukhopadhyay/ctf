"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ApiError, api, errorText } from "@/lib/api-client";

export interface CompetitionFormValues {
  id?: string;
  name: string;
  slug: string;
  tagline: string | null;
  description: string;
  bannerTheme: string;
  institutionId: string | null;
  timezone: string;
  startsAt: string;
  endsAt: string;
  registrationOpensAt: string;
  registrationDeadline: string;
  mode: string;
  minTeamSize: number;
  maxTeamSize: number;
  accessMode: string;
  scoringModel: string;
  tieBreak: string;
  rules: string;
  permittedTools: string;
  prohibitedActivities: string;
  hintPenaltiesEnabled: boolean;
  wrongSubmissionPenalty: number;
  defaultAttemptLimit: number | null;
  freezeAt: string;
  identityDisplay: string;
  allowTeamChangesWhileActive: boolean;
  solutionDisclosure: string;
  isPractice: boolean;
}

/** Converts a Date to the value of a datetime-local input (UTC). */
export function toLocalInput(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 16) : "";
}

const TIMEZONES = ["UTC", "Asia/Kolkata", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "Australia/Sydney"];

export function CompetitionForm({ initial, institutions, locked }: { initial: CompetitionFormValues; institutions: { id: string; name: string }[]; locked?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [mode, setMode] = useState(initial.mode);

  const iso = (v: FormDataEntryValue | null) => (v ? new Date(`${v}Z`).toISOString() : null);

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const num = (k: string) => (f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k)));
        const body = {
          name: f.get("name"), slug: f.get("slug"), tagline: f.get("tagline") || null, description: f.get("description"),
          bannerTheme: f.get("bannerTheme"), institutionId: f.get("institutionId") || null, timezone: f.get("timezone"),
          startsAt: iso(f.get("startsAt")), endsAt: iso(f.get("endsAt")), registrationOpensAt: iso(f.get("registrationOpensAt")),
          registrationDeadline: iso(f.get("registrationDeadline")), freezeAt: iso(f.get("freezeAt")),
          mode: f.get("mode"), minTeamSize: num("minTeamSize") ?? 1, maxTeamSize: num("maxTeamSize") ?? 4,
          accessMode: f.get("accessMode"), scoringModel: f.get("scoringModel"), tieBreak: f.get("tieBreak"),
          rules: f.get("rules"), permittedTools: f.get("permittedTools"), prohibitedActivities: f.get("prohibitedActivities"),
          hintPenaltiesEnabled: f.get("hintPenaltiesEnabled") === "on", wrongSubmissionPenalty: num("wrongSubmissionPenalty") ?? 0,
          defaultAttemptLimit: num("defaultAttemptLimit"), identityDisplay: f.get("identityDisplay"),
          allowTeamChangesWhileActive: f.get("allowTeamChangesWhileActive") === "on", solutionDisclosure: f.get("solutionDisclosure"),
          isPractice: f.get("isPractice") === "on",
        };
        setPending(true); setError(null); setFieldErrors({}); setSaved(false);
        try {
          if (initial.id) {
            await api(`/api/v1/competitions/${initial.id}`, { method: "PATCH", body });
            setSaved(true);
            router.refresh();
          } else {
            const c = await api<{ id: string }>("/api/v1/competitions", { method: "POST", body });
            router.push(`/organizer/competitions/${c.id}`);
          }
        } catch (err) {
          if (err instanceof ApiError && err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
          setError(errorText(err));
        } finally {
          setPending(false);
        }
      }}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Settings saved.</Alert>}
      {locked && <Alert tone="warning">The competition is running: participation mode cannot change.</Alert>}
      <Card>
        <CardHeader><CardTitle>Basics</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Name" htmlFor="name" error={fieldErrors.name}><Input id="name" name="name" defaultValue={initial.name} required minLength={3} maxLength={120} /></Field>
          <Field label="URL slug" htmlFor="slug" hint="lowercase-with-hyphens" error={fieldErrors.slug}><Input id="slug" name="slug" defaultValue={initial.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="font-mono" /></Field>
          <Field label="Tagline" htmlFor="tagline" className="md:col-span-2"><Input id="tagline" name="tagline" defaultValue={initial.tagline ?? ""} maxLength={160} /></Field>
          <Field label="Description (Markdown)" htmlFor="description" className="md:col-span-2"><Textarea id="description" name="description" defaultValue={initial.description} rows={6} /></Field>
          <Field label="Banner theme" htmlFor="bannerTheme"><Select id="bannerTheme" name="bannerTheme" defaultValue={initial.bannerTheme}>{["teal", "cyan", "emerald", "indigo", "slate"].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Institution" htmlFor="institutionId"><Select id="institutionId" name="institutionId" defaultValue={initial.institutionId ?? ""}><option value="">— None —</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
          <Checkbox name="isPractice" defaultChecked={initial.isPractice} label="Practice arena (no end time; used for daily practice)" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Display timezone" htmlFor="timezone" error={fieldErrors.timezone}><Select id="timezone" name="timezone" defaultValue={initial.timezone}>{[...new Set([initial.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Starts (UTC)" htmlFor="startsAt" error={fieldErrors.startsAt}><Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={initial.startsAt} required /></Field>
          <Field label="Ends (UTC)" htmlFor="endsAt" error={fieldErrors.endsAt}><Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={initial.endsAt} /></Field>
          <Field label="Registration opens (UTC)" htmlFor="registrationOpensAt"><Input id="registrationOpensAt" name="registrationOpensAt" type="datetime-local" defaultValue={initial.registrationOpensAt} /></Field>
          <Field label="Registration deadline (UTC)" htmlFor="registrationDeadline"><Input id="registrationDeadline" name="registrationDeadline" type="datetime-local" defaultValue={initial.registrationDeadline} /></Field>
          <Field label="Leaderboard freeze (UTC)" htmlFor="freezeAt"><Input id="freezeAt" name="freezeAt" type="datetime-local" defaultValue={initial.freezeAt} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Participation & access</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Mode" htmlFor="mode"><Select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)} disabled={locked}><option value="INDIVIDUAL">Individual</option><option value="TEAM">Team</option></Select></Field>
          {locked && <input type="hidden" name="mode" value={mode} />}
          {mode === "TEAM" && (<>
            <Field label="Min team size" htmlFor="minTeamSize"><Input id="minTeamSize" name="minTeamSize" type="number" min={1} max={50} defaultValue={initial.minTeamSize} /></Field>
            <Field label="Max team size" htmlFor="maxTeamSize" error={fieldErrors.maxTeamSize}><Input id="maxTeamSize" name="maxTeamSize" type="number" min={1} max={50} defaultValue={initial.maxTeamSize} /></Field>
            <Checkbox name="allowTeamChangesWhileActive" defaultChecked={initial.allowTeamChangesWhileActive} label="Allow team changes while running" className="md:col-span-3" />
          </>)}
          <Field label="Access" htmlFor="accessMode"><Select id="accessMode" name="accessMode" defaultValue={initial.accessMode}><option value="PUBLIC">Public</option><option value="PRIVATE">Private (approval)</option><option value="INVITATION">Invitation code</option></Select></Field>
          <Field label="Identity display on leaderboard" htmlFor="identityDisplay"><Select id="identityDisplay" name="identityDisplay" defaultValue={initial.identityDisplay}><option value="FULL">Show names</option><option value="ANONYMIZED">Anonymize others</option></Select></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Scoring</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Field label="Scoring model" htmlFor="scoringModel"><Select id="scoringModel" name="scoringModel" defaultValue={initial.scoringModel}><option value="STATIC">Static</option><option value="DYNAMIC">Dynamic (decays with solves)</option></Select></Field>
          <Field label="Tie-break" htmlFor="tieBreak"><Select id="tieBreak" name="tieBreak" defaultValue={initial.tieBreak}><option value="EARLIEST_LAST_SOLVE">Earliest last solve</option><option value="FEWEST_SUBMISSIONS">Fewest submissions</option></Select></Field>
          <Field label="Solution disclosure" htmlFor="solutionDisclosure"><Select id="solutionDisclosure" name="solutionDisclosure" defaultValue={initial.solutionDisclosure}><option value="NEVER">Never</option><option value="AFTER_SOLVE">After solving</option><option value="AFTER_END">After the competition</option></Select></Field>
          <Field label="Wrong-answer penalty (0 = off)" htmlFor="wrongSubmissionPenalty"><Input id="wrongSubmissionPenalty" name="wrongSubmissionPenalty" type="number" min={0} max={1000} defaultValue={initial.wrongSubmissionPenalty} /></Field>
          <Field label="Default attempt limit (blank = unlimited)" htmlFor="defaultAttemptLimit"><Input id="defaultAttemptLimit" name="defaultAttemptLimit" type="number" min={1} defaultValue={initial.defaultAttemptLimit ?? ""} /></Field>
          <Checkbox name="hintPenaltiesEnabled" defaultChecked={initial.hintPenaltiesEnabled} label="Deduct hint costs" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Competition rules (Markdown, required to publish)" htmlFor="rules"><Textarea id="rules" name="rules" defaultValue={initial.rules} rows={6} /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Permitted tools" htmlFor="permittedTools"><Textarea id="permittedTools" name="permittedTools" defaultValue={initial.permittedTools} rows={4} /></Field>
            <Field label="Prohibited activities" htmlFor="prohibitedActivities"><Textarea id="prohibitedActivities" name="prohibitedActivities" defaultValue={initial.prohibitedActivities} rows={4} /></Field>
          </div>
        </CardContent>
      </Card>
      <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : initial.id ? "Save settings" : "Create competition"}</Button>
    </form>
  );
}
