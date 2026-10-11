import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock, Download, FileText, GraduationCap, Lock, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Markdown } from "@/components/markdown";
import { CategoryIcon } from "@/components/category-icon";
import { DifficultyBadge } from "@/components/status-badge";
import { requireUser } from "@/server/auth/current";
import { getVisibleCompetition } from "@/server/services/competitions";
import { getChallengeView } from "@/server/services/challenges";
import { AppError } from "@/server/errors";
import { formatBytes, formatDateTime } from "@/lib/utils";
import { SubmitFlagForm, WriteupForm } from "./submit-form";
import { HintsPanel } from "./hints-panel";
import { InstancePanel } from "./instance-panel";

export default async function ChallengePage({ params }: { params: Promise<{ slug: string; challengeId: string }> }) {
  const { slug, challengeId } = await params;
  const user = await requireUser(`/competitions/${slug}/challenges/${challengeId}`);
  const vis = await getVisibleCompetition(user, slug).catch(() => null);
  if (!vis) notFound();
  const c = vis.competition;
  let view;
  try {
    view = await getChallengeView(user, c.id, challengeId);
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
  const back = (
    <Link href={`/competitions/${slug}/challenges`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
      <ArrowLeft className="h-4 w-4" /> All challenges
    </Link>
  );

  if (view.locked) {
    return (
      <div>
        {back}
        <Card className="mx-auto max-w-xl text-center">
          <CardHeader>
            <Lock className="mx-auto h-8 w-8 text-subtle" />
            <CardTitle className="mt-2">{view.title} is locked</CardTitle>
            <CardDescription>Solve these prerequisite challenges first:</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {view.prerequisites.map((p) => (
                <li key={p.id}><Link className="text-accent hover:underline" href={`/competitions/${slug}/challenges/${p.id}`}>{p.title}</Link></li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  const active = c.status === "ACTIVE" && !view.closed;
  return (
    <div>
      {back}
      {view.isStaff && <Alert tone="info" title="Staff preview" className="mb-4">This is how participants see the challenge. Hints are shown unlocked for staff. Submitting is disabled for staff accounts — use the flag tester in the editor.</Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <CategoryIcon slug={view.category?.slug ?? ""} className="h-4 w-4 text-primary" />
                <span>{view.category?.name}{view.subcategory ? ` · ${view.subcategory}` : ""}</span>
                <span className="font-mono">v{view.version}</span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-2xl font-bold">{view.title}</h2>
                <div className="text-right">
                  <div className="font-mono text-3xl font-bold text-primary">{view.value}</div>
                  <div className="text-xs text-muted">{view.scoringModel === "DYNAMIC" ? `dynamic · base ${view.basePoints}` : "points"}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={view.difficulty} />
                <Badge tone="muted"><Users className="h-3 w-3" />{view.solves} solves</Badge>
                {view.estimatedMinutes && <Badge tone="muted"><Clock className="h-3 w-3" />~{view.estimatedMinutes} min</Badge>}
                {view.solved && <Badge tone="success"><CheckCircle2 className="h-3 w-3" />solved {view.solvedAt ? formatDateTime(view.solvedAt, c.timezone) : ""}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <Markdown>{view.description}</Markdown>
              {view.learningObjectives && (
                <div className="rounded-lg border border-border bg-bg/50 p-4">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-primary" />Learning objectives</h3>
                  <Markdown>{view.learningObjectives}</Markdown>
                </div>
              )}
              {(view.tags.length > 0 || view.skills.length > 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {view.skills.map((s) => <Badge key={s} tone="primary">{s}</Badge>)}
                  {view.tags.map((t) => <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-muted">#{t}</span>)}
                </div>
              )}
            </CardContent>
          </Card>

          {view.artifacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />Artifacts</CardTitle>
                <CardDescription>Files are synthetic and delivered as downloads only. Verify integrity with the SHA-256 checksum. Treat every file as untrusted and analyse it in a VM or sandbox.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <THead><TR><TH>File</TH><TH>Type</TH><TH>Size</TH><TH>SHA-256</TH><TH className="sr-only">Actions</TH></TR></THead>
                  <TBody>
                    {view.artifacts.map((a) => (
                      <TR key={a.id}>
                        <TD><Link href={`/artifacts/${a.id}`} className="font-mono text-sm hover:text-primary">{a.filename}</Link>{!a.visible && <Badge tone="warning" className="ml-2">hidden</Badge>}</TD>
                        <TD className="text-muted">{a.detectedType}</TD>
                        <TD className="whitespace-nowrap text-muted">{formatBytes(a.sizeBytes)}</TD>
                        <TD><code className="break-all font-mono text-[11px] text-subtle" title={a.sha256}>{a.sha256.slice(0, 16)}…</code></TD>
                        <TD><a href={`/api/v1/artifacts/${a.id}/download`} className="inline-flex items-center gap-1 text-sm text-accent hover:underline" download><Download className="h-4 w-4" />Download</a></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {(view.explanation || view.remediation) && (
            <Card className="border-primary/40">
              <CardHeader><CardTitle className="text-primary">Explanation</CardTitle><CardDescription>Disclosed per the competition&apos;s solution policy.</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                {view.explanation && <Markdown>{view.explanation}</Markdown>}
                {view.remediation && (<><h3 className="font-semibold">Remediation</h3><Markdown>{view.remediation}</Markdown></>)}
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          {view.accessMethod === "INSTANCE" && (
            <InstancePanel competitionId={c.id} challengeId={view.id} initial={view.instance ? { ...view.instance, expiresAt: view.instance.expiresAt.toISOString(), connection: view.instance.connection as never } : null} enabled={active && !!view.subjectKey && !view.isStaff} />
          )}
          {view.gradingMode === "FLAG" ? (
            <SubmitFlagForm
              competitionId={c.id}
              challengeId={view.id}
              solved={view.solved}
              disabled={!active || !view.canSubmit || view.isStaff}
              disabledReason={view.isStaff ? "Staff cannot submit." : !view.subjectKey ? (c.mode === "TEAM" ? "Join a team to submit." : "Registration not approved.") : !active ? "Submissions are closed." : undefined}
              attemptsUsed={view.attemptsUsed}
              attemptLimit={view.attemptLimit}
            />
          ) : (
            <WriteupForm competitionId={c.id} challengeId={view.id} solved={view.solved} disabled={!active || !view.canSubmit || view.isStaff} />
          )}
          <HintsPanel competitionId={c.id} challengeId={view.id} hints={view.hints.map((h) => ({ ...h, availableAfter: h.availableAfter?.toISOString() ?? null }))} canUnlock={active && !!view.subjectKey && !view.isStaff} />
        </aside>
      </div>
    </div>
  );
}
