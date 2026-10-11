import { route } from "@/server/http/api";
import { platformOverview } from "@/server/services/analytics";

export const GET = route({ auth: "required" }, async ({ user }) => platformOverview(user));
