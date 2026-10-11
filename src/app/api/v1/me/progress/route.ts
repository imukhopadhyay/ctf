import { route } from "@/server/http/api";
import { getUserProgress } from "@/server/services/achievements";

export const GET = route({ auth: "required" }, async ({ user }) => getUserProgress(user!.id));
