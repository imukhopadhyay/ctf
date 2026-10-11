import { route } from "@/server/http/api";
import { getMyTeam } from "@/server/services/teams";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => getMyTeam(user, params.id));
