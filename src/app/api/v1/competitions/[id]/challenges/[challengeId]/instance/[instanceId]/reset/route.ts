import { route } from "@/server/http/api";
import { resetInstance } from "@/server/services/instances";

export const POST = route<{ id: string; challengeId: string; instanceId: string }>({ auth: "required" }, async ({ user, params }) =>
  resetInstance(user, params.id, params.challengeId, params.instanceId),
);
