import { z } from "zod";
import { route } from "@/server/http/api";
import { testFlag } from "@/server/services/flags";

export const POST = route<{ id: string }, { value: string }>(
  { auth: "required", body: z.object({ value: z.string().min(1).max(512) }) },
  async ({ user, params, body }) => testFlag(user, params.id, body.value),
);
