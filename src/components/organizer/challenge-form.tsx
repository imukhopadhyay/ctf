"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { ApiError, api, errorText } from "@/lib/api-client";

export interface ChallengeFormValues {
  id?: string;
  title: string; slug: string; categoryId: string; subcategory: string | null; description: string; learningObjectives: string;
  difficulty: string; points: number; scoringModel: string | null; minPoints: number; decay: number; estimatedMinutes: number | null;
  accessMethod: string; environmentId: string | null; gradingMode: string; attemptLimit: number | null; releaseAt: string; closeAt: string;
  tags: string[]; skills: string[]; solution: string; instructorNotes: string; explanation: string; remediation: string; prerequisiteIds: string[];
}

interface Props {
  competitionId: string;
  initial: ChallengeFormValues;
  categories: { id: string; name: string }[];
  environments: { id: string; name: string; enabled: boolean }[];
  otherChallenges: { id: string; title: string }[];
}

export function ChallengeForm({ competitionId, initial, categories, environments, otherChallenges }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [access, setAccess] = useState(initial.accessMethod);

  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const num = (k: string) => (f.get(k) === "" || f.get(k) === null ? null : Number(f.get(k)));
      const list = (k: string) => String(f.get(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      const iso = (k: string) => (f.get(k) ? new Date(`${f.get(k)}Z`).toISOString() : null);
      const body = {
        title: f.get("title"), slug: f.get("slug"), categoryId: f.get("categoryId"), subcategory: f.get("subcategory") || null,
        description: f.get("description"), learningObjectives: f.get("learningObjectives"), difficulty: f.get("difficulty"),
        points: num("points") ?? 100, scoringModel: f.get("scoringModel") || null, minPoints: num("minPoints") ?? 50, decay: num("decay") ?? 20,
        estimatedMinutes: num("estimatedMinutes"), accessMethod: f.get("accessMethod"), environmentId: f.get("environmentId") || null,
        gradingMode: f.get("gradingMode"), attemptLimit: num("attemptLimit"), releaseAt: iso("releaseAt"), closeAt: iso("closeAt"),
        tags: list("tags"), skills: list("skills"), solution: f.get("solution"), instructorNotes: f.get("instructorNotes"),
        explanation: f.get("explanation"), remediation: f.get("remediation"), prerequisiteIds: f.getAll("prerequisiteIds").map(String),
        changeNote: f.get("changeNote") || undefined,
      };
      setPending(true); setError(null); setFieldErrors({}); setSaved(false);
      try {
        if (initial.id) {
          await api(`/api/v1/challenges/${initial.id}`, { method: "PATCH", body });
          setSaved(true);
          router.refresh();
        } else {
          const c = await api<{ id: string }>(`/api/v1/competitions/${competitionId}/challenges`, { method: "POST", body });
          router.push(`/organizer/challenges/${c.id}`);
        }
      } catch (err) {
        if (err instanceof ApiError && err.details) setFieldErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
        setError(errorText(err));
      } finally {
        setPending(false);
      }
    }}>
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && <Alert tone="success">Saved as a new version.</Alert>}
      <Card>
        <CardHeader><CardTitle>Content</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Title" htmlFor="title" error={fieldErrors.title}><Input id="title" name="title" defaultValue={initial.title} required minLength={3} maxLength={120} /></Field>
          <Field label="Slug" htmlFor="slug" error={fieldErrors.slug}><Input id="slug" name="slug" defaultValue={initial.slug} required className="font-mono" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
          <Field label="Category" htmlFor="categoryId"><Select id="categoryId" name="categoryId" defaultValue={initial.categoryId} required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Subcategory" htmlFor="subcategory"><Input id="subcategory" name="subcategory" defaultValue={initial.subcategory ?? ""} maxLength={60} /></Field>
          <Field label="Description (Markdown, shown to participants)" htmlFor="description" className="md:col-span-2" error={fieldErrors.description}><Textarea id="description" name="description" defaultValue={initial.description} rows={8} /></Field>
          <Field label="Learning objectives" htmlFor="learningObjectives" className="md:col-span-2"><Textarea id="learningObjectives" name="learningObjectives" defaultValue={initial.learningObjectives} rows={3} /></Field>
          <Field label="Tags (comma separated)" htmlFor="tags"><Input id="tags" name="tags" defaultValue={initial.tags.join(", ")} /></Field>
          <Field label="Skills (comma separated)" htmlFor="skills"><Input id="skills" name="skills" defaultValue={initial.skills.join(", ")} /></Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Scoring & availability</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Field label="Difficulty" htmlFor="difficulty"><Select id="difficulty" name="difficulty" defaultValue={initial.difficulty}>{["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Points" htmlFor="points"><Input id="points" name="points" type="number" min={0} defaultValue={initial.points} /></Field>
          <Field label="Scoring" htmlFor="scoringModel"><Select id="scoringModel" name="scoringModel" defaultValue={initial.scoringModel ?? ""}><option value="">Inherit competition</option><option value="STATIC">Static</option><option value="DYNAMIC">Dynamic</option></Select></Field>
          <Field label="Est. minutes" htmlFor="estimatedMinutes"><Input id="estimatedMinutes" name="estimatedMinutes" type="number" min={1} defaultValue={initial.estimatedMinutes ?? ""} /></Field>
          <Field label="Dynamic minimum" htmlFor="minPoints" error={fieldErrors.minPoints}><Input id="minPoints" name="minPoints" type="number" min={0} defaultValue={initial.minPoints} /></Field>
          <Field label="Dynamic decay (solves)" htmlFor="decay"><Input id="decay" name="decay" type="number" min={0} defaultValue={initial.decay} /></Field>
          <Field label="Attempt limit" htmlFor="attemptLimit" hint="blank = competition default"><Input id="attemptLimit" name="attemptLimit" type="number" min={1} defaultValue={initial.attemptLimit ?? ""} /></Field>
          <Field label="Grading" htmlFor="gradingMode"><Select id="gradingMode" name="gradingMode" defaultValue={initial.gradingMode}><option value="FLAG">Flag</option><option value="MANUAL">Manual write-up</option></Select></Field>
          <Field label="Release at (UTC)" htmlFor="releaseAt"><Input id="releaseAt" name="releaseAt" type="datetime-local" defaultValue={initial.releaseAt} /></Field>
          <Field label="Close at (UTC)" htmlFor="closeAt" error={fieldErrors.closeAt}><Input id="closeAt" name="closeAt" type="datetime-local" defaultValue={initial.closeAt} /></Field>
          <Field label="Access method" htmlFor="accessMethod"><Select id="accessMethod" name="accessMethod" value={access} onChange={(e) => setAccess(e.target.value)}><option value="OFFLINE">Offline (artifacts)</option><option value="INSTANCE">Isolated instance</option></Select></Field>
          {access === "INSTANCE" && (
            <Field label="Execution environment" htmlFor="environmentId"><Select id="environmentId" name="environmentId" defaultValue={initial.environmentId ?? ""}><option value="">— Select —</option>{environments.map((e) => <option key={e.id} value={e.id}>{e.name}{e.enabled ? "" : " (disabled)"}</option>)}</Select></Field>
          )}
          {otherChallenges.length > 0 && (
            <Field label="Prerequisites" htmlFor="prerequisiteIds" className="md:col-span-4" hint="Hold Ctrl/Cmd to select several">
              <Select id="prerequisiteIds" name="prerequisiteIds" multiple defaultValue={initial.prerequisiteIds} className="h-28">{otherChallenges.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select>
            </Field>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Staff-only & post-solve content</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Expected solution (staff only)" htmlFor="solution"><Textarea id="solution" name="solution" defaultValue={initial.solution} rows={5} /></Field>
          <Field label="Instructor notes (staff only)" htmlFor="instructorNotes"><Textarea id="instructorNotes" name="instructorNotes" defaultValue={initial.instructorNotes} rows={5} /></Field>
          <Field label="Concept explanation (disclosed per policy)" htmlFor="explanation"><Textarea id="explanation" name="explanation" defaultValue={initial.explanation} rows={5} /></Field>
          <Field label="Remediation lesson (disclosed per policy)" htmlFor="remediation"><Textarea id="remediation" name="remediation" defaultValue={initial.remediation} rows={5} /></Field>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-end gap-3">
        {initial.id && <Field label="Change note" htmlFor="changeNote" className="min-w-64 flex-1"><Input id="changeNote" name="changeNote" maxLength={500} placeholder="What changed in this version?" /></Field>}
        <Button type="submit" size="lg" disabled={pending}>{pending ? "Saving…" : initial.id ? "Save new version" : "Create challenge"}</Button>
      </div>
    </form>
  );
}
