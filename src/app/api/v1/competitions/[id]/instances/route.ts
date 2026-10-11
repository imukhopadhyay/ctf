import { route } from "@/server/http/api";
import { listCompetitionInstances } from "@/server/services/instances";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => listCompetitionInstances(user, params.id));
