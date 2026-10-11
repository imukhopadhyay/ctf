import { route } from "@/server/http/api";
import { removeMember } from "@/server/services/teams";

export const DELETE = route<{ id: string; teamId: string; userId: string }>({ auth: "required" }, async ({ user, params }) => {
  await removeMember(user, params.id, params.teamId, params.userId);
  return { removed: true };
});
