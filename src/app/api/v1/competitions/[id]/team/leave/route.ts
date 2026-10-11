import { route } from "@/server/http/api";
import { leaveTeam } from "@/server/services/teams";

export const POST = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await leaveTeam(user, params.id);
  return { left: true };
});
