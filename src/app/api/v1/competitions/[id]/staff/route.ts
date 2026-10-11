import { z } from "zod";
import { route } from "@/server/http/api";
import { assignStaff, listStaff } from "@/server/services/competitions";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => listStaff(user, params.id));

export const POST = route<{ id: string }, { username: string; role: "ORGANIZER" | "EVALUATOR" }>(
  { auth: "required", body: z.object({ username: z.string().trim().min(3).max(32), role: z.enum(["ORGANIZER", "EVALUATOR"]) }) },
  async ({ user, params, body }) => assignStaff(user, params.id, body.username, body.role),
);
