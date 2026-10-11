import { route } from "@/server/http/api";
import { removeStaff } from "@/server/services/competitions";

export const DELETE = route<{ id: string; staffId: string }>({ auth: "required" }, async ({ user, params }) => {
  await removeStaff(user, params.id, params.staffId);
  return { removed: true };
});
