import { route } from "@/server/http/api";
import { listPendingGrading } from "@/server/services/submissions";

export const GET = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => listPendingGrading(user, params.id));
