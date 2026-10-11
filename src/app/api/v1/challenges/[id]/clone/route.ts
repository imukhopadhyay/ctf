import { z } from "zod";
import { route } from "@/server/http/api";
import { cloneChallenge } from "@/server/services/challenges";

export const POST = route<{ id: string }, { competitionId: string }>(
  { auth: "required", body: z.object({ competitionId: z.string().cuid() }) },
  async ({ user, params, body }) => cloneChallenge(user, params.id, body.competitionId),
);
