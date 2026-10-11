import { Alert } from "@/components/ui/misc";
import { ChallengeForm } from "@/components/organizer/challenge-form";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { competitionCan } from "@/server/services/access";
import { listCategories } from "@/server/services/challenges";

export default async function NewChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!(await competitionCan(user, id, "challenge.manage"))) return <Alert tone="warning">Only organizers can create challenges.</Alert>;
  const [categories, environments, others] = await Promise.all([
    listCategories(),
    db.executionEnvironment.findMany({ select: { id: true, name: true, enabled: true }, orderBy: { name: "asc" } }),
    db.challenge.findMany({ where: { competitionId: id }, select: { id: true, title: true } }),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="mb-4 text-lg font-semibold">New challenge</h2>
      <ChallengeForm competitionId={id} categories={categories} environments={environments} otherChallenges={others}
        initial={{ title: "", slug: "", categoryId: categories[0]?.id ?? "", subcategory: null, description: "", learningObjectives: "", difficulty: "BEGINNER", points: 100, scoringModel: null, minPoints: 50, decay: 20, estimatedMinutes: null, accessMethod: "OFFLINE", environmentId: null, gradingMode: "FLAG", attemptLimit: null, releaseAt: "", closeAt: "", tags: [], skills: [], solution: "", instructorNotes: "", explanation: "", remediation: "", prerequisiteIds: [] }} />
    </div>
  );
}
