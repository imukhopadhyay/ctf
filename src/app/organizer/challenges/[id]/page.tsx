import { notFound } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/status-badge";
import { ChallengeForm } from "@/components/organizer/challenge-form";
import { toLocalInput } from "@/components/organizer/competition-form";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { getChallengeForStaff, listCategories } from "@/server/services/challenges";
import { competitionCan } from "@/server/services/access";
import { AppError } from "@/server/errors";
import { formatDateTime } from "@/lib/utils";
import { FlagsPanel, HintsManager, ArtifactsManager, StatusActions, ReviewForm } from "./panels";

export const metadata = { title: "Challenge editor" };

export default async function ChallengeEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/organizer/challenges/${id}`);
  let data;
  try {
    data = await getChallengeForStaff(user, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const { challenge: c, competition, canManage, publishProblems } = data;
  const canReview = await competitionCan(user, competition.id, "challenge.review");
  const [categories, environments, others] = await Promise.all([
    listCategories(),
    db.executionEnvironment.findMany({ select: { id: true, name: true, enabled: true }, orderBy: { name: "asc" } }),
    db.challenge.findMany({ where: { competitionId: competition.id, NOT: { id } }, select: { id: true, title: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={<Link href={`/organizer/competitions/${competition.id}`} className="hover:underline">← {competition.name}</Link>}
        title={<span className="flex items-center gap-3">{c.title}<StatusBadge status={c.status} /></span>}
        description={`v${c.version} · ${c.category.name} · ${c._count.solves} solves · ${c._count.submissions} submissions · author ${c.author?.displayName ?? "—"}${c.reviewer ? ` · reviewer ${c.reviewer.displayName}` : ""}`}
        actions={<Button asChild variant="secondary"><Link href={`/competitions/${competition.slug}/challenges/${c.id}`}><Eye />Preview as participant</Link></Button>}
      />
      {canManage && <StatusActions challengeId={c.id} status={c.status} problems={publishProblems} />}
      {!canManage && <Alert tone="info">Read-only: you can review this challenge but not edit it.</Alert>}
      <Tabs defaultValue={canManage ? "content" : "reviews"}>
        <TabsList>
          {canManage && <TabsTrigger value="content">Content</TabsTrigger>}
          {canManage && <TabsTrigger value="flags">Flags ({c.flags.length})</TabsTrigger>}
          {canManage && <TabsTrigger value="hints">Hints ({c.hints.length})</TabsTrigger>}
          {canManage && <TabsTrigger value="artifacts">Artifacts ({c.artifacts.length})</TabsTrigger>}
          <TabsTrigger value="reviews">Reviews ({c.reviews.length})</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        {canManage && (
          <TabsContent value="content">
            <ChallengeForm competitionId={competition.id} categories={categories} environments={environments} otherChallenges={others}
              initial={{ ...c, releaseAt: toLocalInput(c.releaseAt), closeAt: toLocalInput(c.closeAt), prerequisiteIds: c.prerequisites.map((p) => p.id) }} />
          </TabsContent>
        )}
        {canManage && <TabsContent value="flags"><FlagsPanel challengeId={c.id} accessMethod={c.accessMethod} flags={c.flags.map((f) => ({ ...f, expiresAt: f.expiresAt?.toISOString() ?? null, createdAt: f.createdAt.toISOString(), rotatedAt: f.rotatedAt?.toISOString() ?? null }))} testedAt={c.flagsTestedAt?.toISOString() ?? null} /></TabsContent>}
        {canManage && <TabsContent value="hints"><HintsManager challengeId={c.id} hints={c.hints.map((h) => ({ id: h.id, title: h.title, content: h.content, cost: h.cost, order: h.order, requiresPrevious: h.requiresPrevious, minAttempts: h.minAttempts }))} /></TabsContent>}
        {canManage && <TabsContent value="artifacts"><ArtifactsManager challengeId={c.id} artifacts={c.artifacts.map((a) => ({ id: a.id, filename: a.filename, sha256: a.sha256, sizeBytes: a.sizeBytes, detectedType: a.detectedType, visible: a.visible, description: a.description }))} /></TabsContent>}
        <TabsContent value="reviews" className="space-y-4">
          {canReview && <ReviewForm challengeId={c.id} />}
          {c.reviews.map((r) => (
            <Card key={r.id}>
              <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><StatusBadge status={r.verdict === "APPROVE" ? "APPROVED" : r.verdict === "CHANGES_REQUESTED" ? "REJECTED" : "PENDING"} />{r.reviewer.displayName} · v{r.challengeVersion} · {formatDateTime(r.createdAt)}</CardTitle></CardHeader>
              <CardContent className="text-sm"><p className="text-muted">Quality {r.qualityRating ?? "—"}/5 · Educational value {r.educationalRating ?? "—"}/5</p><p className="mt-2 whitespace-pre-wrap">{r.comments}</p></CardContent>
            </Card>
          ))}
          {c.reviews.length === 0 && <p className="text-sm text-muted">No reviews yet.</p>}
        </TabsContent>
        <TabsContent value="history">
          <Card><CardContent className="pt-4">
            <ul className="space-y-2 text-sm">{c.versions.map((v) => <li key={v.id} className="flex justify-between border-b border-border/60 pb-2"><span><span className="font-mono">v{v.version}</span> {v.changeNote || <span className="text-muted">no note</span>}</span><span className="text-xs text-subtle">{formatDateTime(v.createdAt)}</span></li>)}</ul>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
