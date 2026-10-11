import { z } from "zod";
import { route } from "@/server/http/api";
import { deleteHint, hintInputSchema, updateHint } from "@/server/services/challenges";

const patch = hintInputSchema.partial();
export const PATCH = route<{ id: string; hintId: string }, z.infer<typeof patch>>({ auth: "required", body: patch }, async ({ user, params, body }) =>
  updateHint(user, params.id, params.hintId, body),
);

export const DELETE = route<{ id: string; hintId: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteHint(user, params.id, params.hintId);
  return { deleted: true };
});
