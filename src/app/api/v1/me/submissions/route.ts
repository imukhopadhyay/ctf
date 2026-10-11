import { z } from "zod";
import { route } from "@/server/http/api";
import { mySubmissions } from "@/server/services/submissions";

const query = z.object({
  competitionId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route<Record<string, string>, undefined, z.infer<typeof query>>({ auth: "required", query }, async ({ user, query }) => mySubmissions(user, query));
