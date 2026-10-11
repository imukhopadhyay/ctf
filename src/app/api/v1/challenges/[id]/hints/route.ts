import { z } from "zod";
import { route } from "@/server/http/api";
import { createHint, hintInputSchema } from "@/server/services/challenges";

export const POST = route<{ id: string }, z.infer<typeof hintInputSchema>>({ auth: "required", body: hintInputSchema }, async ({ user, params, body }) =>
  createHint(user, params.id, body),
);
