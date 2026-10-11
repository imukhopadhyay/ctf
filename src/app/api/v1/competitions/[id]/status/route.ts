import { z } from "zod";
import { route } from "@/server/http/api";
import { transitionCompetition } from "@/server/services/competitions";

export const POST = route<{ id: string }, { to: "DRAFT" | "SCHEDULED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED" }>(
  { auth: "required", body: z.object({ to: z.enum(["DRAFT", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"]) }) },
  async ({ user, params, body }) => transitionCompetition(user, params.id, body.to),
);
