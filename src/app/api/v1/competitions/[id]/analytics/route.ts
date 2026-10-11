import { route } from "@/server/http/api";
import { competitionAnalytics } from "@/server/services/analytics";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => competitionAnalytics(user, params.id));
