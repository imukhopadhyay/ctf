import { z } from "zod";
import { route } from "@/server/http/api";
import { addFlag, flagInputSchema } from "@/server/services/flags";

export const POST = route<{ id: string }, z.infer<typeof flagInputSchema>>(
  { auth: "required", body: flagInputSchema },
  async ({ user, params, body }) => addFlag(user, params.id, body),
);
