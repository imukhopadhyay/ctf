import { z } from "zod";
import { route } from "@/server/http/api";
import { achievementInputSchema, listAchievementsAdmin, upsertAchievement } from "@/server/services/achievements";

export const GET = route({ auth: "required" }, async ({ user }) => listAchievementsAdmin(user));
export const POST = route<Record<string, string>, z.infer<typeof achievementInputSchema>>({ auth: "required", body: achievementInputSchema }, async ({ user, body }) =>
  upsertAchievement(user, body),
);
