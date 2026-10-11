import { z } from "zod";
import { route } from "@/server/http/api";
import { competitionSubmissions } from "@/server/services/submissions";

const query = z.object({
  cursor: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(200).optional(),
  result: z.enum(["CORRECT", "INCORRECT", "ALREADY_SOLVED", "PENDING_REVIEW", "REJECTED_REVIEW"]).optional(),
  challengeId: z.string().cuid().optional(),
});

export const GET = route<{ id: string }, undefined, z.infer<typeof query>>({ auth: "required", query }, async ({ user, params, query }) =>
  competitionSubmissions(user, params.id, query),
);
