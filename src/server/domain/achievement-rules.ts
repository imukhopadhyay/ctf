import { z } from "zod";

/** Administrator-configurable achievement criteria (stored as JSON on Achievement.criteria). */
export const achievementCriteriaSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("first_blood"), count: z.number().int().min(1).default(1) }),
  z.object({ type: z.literal("total_solves"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("category_solves"), category: z.string().min(1), count: z.number().int().min(1) }),
  z.object({
    type: z.literal("all_categories"),
    categories: z.array(z.string().min(1)).min(1),
    minEach: z.number().int().min(1).default(1),
  }),
  z.object({ type: z.literal("streak_days"), days: z.number().int().min(2) }),
  z.object({ type: z.literal("hintless_solves"), count: z.number().int().min(1) }),
  z.object({ type: z.literal("team_contributors"), minMembers: z.number().int().min(2) }),
]);
export type AchievementCriteria = z.infer<typeof achievementCriteriaSchema>;

export interface SolveFact {
  categorySlug: string;
  createdAt: Date;
  isFirstBlood: boolean;
  usedHint: boolean;
  solverUserId: string;
}

/** Longest run of consecutive UTC calendar days that contain at least one solve. */
export function longestDailyStreak(dates: readonly Date[]): number {
  const days = [...new Set(dates.map((d) => Math.floor(d.getTime() / 86_400_000)))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && days[i] === days[i - 1] + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

/** Progress towards a criterion, as [current, target]. */
export function achievementProgress(criteria: AchievementCriteria, solves: readonly SolveFact[]): [number, number] {
  switch (criteria.type) {
    case "first_blood":
      return [solves.filter((s) => s.isFirstBlood).length, criteria.count];
    case "total_solves":
      return [solves.length, criteria.count];
    case "category_solves":
      return [solves.filter((s) => s.categorySlug === criteria.category).length, criteria.count];
    case "all_categories": {
      const done = criteria.categories.filter(
        (c) => solves.filter((s) => s.categorySlug === c).length >= criteria.minEach,
      ).length;
      return [done, criteria.categories.length];
    }
    case "streak_days":
      return [longestDailyStreak(solves.map((s) => s.createdAt)), criteria.days];
    case "hintless_solves":
      return [solves.filter((s) => !s.usedHint).length, criteria.count];
    case "team_contributors":
      return [new Set(solves.map((s) => s.solverUserId)).size, criteria.minMembers];
  }
}

export function isAchieved(criteria: AchievementCriteria, solves: readonly SolveFact[]): boolean {
  const [current, target] = achievementProgress(criteria, solves);
  return current >= target;
}
