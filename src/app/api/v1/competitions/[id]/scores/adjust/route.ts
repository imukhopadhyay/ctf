import { route } from "@/server/http/api";
import { adjustScore, adjustmentSchema } from "@/server/services/score-admin";

export const POST = route<{ id: string }, ReturnType<typeof adjustmentSchema.parse>>(
  { auth: "required", body: adjustmentSchema },
  async ({ user, params, body }) => adjustScore(user, params.id, body),
);
