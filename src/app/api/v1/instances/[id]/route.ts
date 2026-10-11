import { route } from "@/server/http/api";
import { adminTerminateInstance } from "@/server/services/instances";

export const DELETE = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await adminTerminateInstance(user, params.id);
  return { terminated: true };
});
