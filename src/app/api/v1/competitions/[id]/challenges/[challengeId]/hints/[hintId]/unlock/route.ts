import { route } from "@/server/http/api";
import { unlockHint } from "@/server/services/hints";

export const POST = route<{ id: string; challengeId: string; hintId: string }>({ auth: "required" }, async ({ user, params }) =>
  unlockHint(user, params.id, params.challengeId, params.hintId),
);
