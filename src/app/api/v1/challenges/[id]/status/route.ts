import { z } from "zod";
import { route } from "@/server/http/api";
import { setChallengeStatus } from "@/server/services/challenges";

const statuses = ["DRAFT", "IN_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED", "RETIRED"] as const;
export const POST = route<{ id: string }, { to: (typeof statuses)[number] }>(
  { auth: "required", body: z.object({ to: z.enum(statuses) }) },
  async ({ user, params, body }) => setChallengeStatus(user, params.id, body.to),
);
