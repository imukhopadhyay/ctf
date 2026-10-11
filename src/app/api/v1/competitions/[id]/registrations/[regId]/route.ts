import { z } from "zod";
import { route } from "@/server/http/api";
import { decideRegistration } from "@/server/services/competitions";

export const PATCH = route<{ id: string; regId: string }, { decision: "APPROVED" | "REJECTED" }>(
  { auth: "required", body: z.object({ decision: z.enum(["APPROVED", "REJECTED"]) }) },
  async ({ user, params, body }) => decideRegistration(user, params.id, params.regId, body.decision),
);
