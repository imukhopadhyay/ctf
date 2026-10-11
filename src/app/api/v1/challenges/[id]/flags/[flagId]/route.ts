import { z } from "zod";
import { route } from "@/server/http/api";
import { rotateFlag, setFlagActive } from "@/server/services/flags";

const body = z.union([
  z.object({ action: z.literal("rotate"), value: z.string().min(4).max(512) }),
  z.object({ action: z.literal("setActive"), active: z.boolean() }),
]);

export const PATCH = route<{ id: string; flagId: string }, z.infer<typeof body>>({ auth: "required", body }, async ({ user, params, body }) => {
  if (body.action === "rotate") return rotateFlag(user, params.id, params.flagId, body.value);
  await setFlagActive(user, params.id, params.flagId, body.active);
  return { active: body.active };
});
