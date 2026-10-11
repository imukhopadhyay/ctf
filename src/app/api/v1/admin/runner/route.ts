import { route } from "@/server/http/api";
import { runnerHealth } from "@/server/services/instances";

export const GET = route({ auth: "required" }, async ({ user }) => runnerHealth(user));
