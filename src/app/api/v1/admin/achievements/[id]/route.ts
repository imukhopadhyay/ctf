import { z } from "zod";
import { route } from "@/server/http/api";
import { achievementInputSchema, upsertAchievement } from "@/server/services/achievements";

export const PATCH = route<{ id: string }, z.infer<typeof achievementInputSchema>>({ auth: "required", body: achievementInputSchema }, async ({ user, params, body }) =>
  upsertAchievement(user, body, params.id),
);
