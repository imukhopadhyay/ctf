import { z } from "zod";
import { route } from "@/server/http/api";
import { recalculateScores } from "@/server/services/score-admin";

export const POST = route<{ id: string }, { apply: boolean }>(
  { auth: "required", body: z.object({ apply: z.boolean().default(false) }) },
  async ({ user, params, body }) => recalculateScores(user, params.id, body.apply),
);
