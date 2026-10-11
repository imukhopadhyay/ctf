import { Badge } from "@/components/ui/badge";
import { STATUS_TONE } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = STATUS_TONE[status] ?? "default";
  return (
    <Badge tone={tone === "default" ? "default" : tone} className={className}>
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

const DIFF_TONE = { BEGINNER: "success", INTERMEDIATE: "info", ADVANCED: "warning", EXPERT: "danger" } as const;
export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <Badge tone={DIFF_TONE[difficulty as keyof typeof DIFF_TONE] ?? "default"}>{difficulty.charAt(0) + difficulty.slice(1).toLowerCase()}</Badge>;
}
