import { route } from "@/server/http/api";
import { listRegistrations } from "@/server/services/competitions";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => listRegistrations(user, params.id));
