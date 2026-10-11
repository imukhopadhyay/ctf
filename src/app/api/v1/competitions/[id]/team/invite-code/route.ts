import { route } from "@/server/http/api";
import { regenerateInviteCode } from "@/server/services/teams";

export const POST = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => regenerateInviteCode(user, params.id));
