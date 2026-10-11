import { route } from "@/server/http/api";
import { startInstance } from "@/server/services/instances";

export const POST = route<{ id: string; challengeId: string }>({ auth: "required" }, async ({ user, params, ip }) =>
  startInstance(user, params.id, params.challengeId, { ip }),
);
