import { ClipboardCheck } from "lucide-react";
import { Alert, EmptyState } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/current";
import { competitionCan } from "@/server/services/access";
import { listPendingGrading } from "@/server/services/submissions";
import { GradingQueue } from "@/components/organizer/grading-queue";

export default async function GradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!(await competitionCan(user, id, "submission.grade"))) return <Alert tone="warning">You are not an evaluator on this competition.</Alert>;
  const items = await listPendingGrading(user, id);
  if (items.length === 0) return <EmptyState icon={ClipboardCheck} title="Nothing to grade">Manually graded write-ups will appear here.</EmptyState>;
  return <GradingQueue items={items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))} />;
}
