import { route } from "@/server/http/api";
import { submitWriteup, writeupSchema } from "@/server/services/submissions";

export const POST = route<{ id: string; challengeId: string }, { writeup: string }>(
  { auth: "required", body: writeupSchema, maxJsonBytes: 64 * 1024 },
  async ({ user, params, body, ip }) => submitWriteup(user, params.id, params.challengeId, body.writeup, { ip }),
);
