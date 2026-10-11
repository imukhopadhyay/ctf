import { route } from "@/server/http/api";
import { stopInstance } from "@/server/services/instances";

export const DELETE = route<{ id: string; challengeId: string; instanceId: string }>({ auth: "required" }, async ({ user, params }) => {
  await stopInstance(user, params.id, params.challengeId, params.instanceId);
  return { stopped: true };
});
