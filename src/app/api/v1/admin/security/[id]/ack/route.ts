import { route } from "@/server/http/api";
import { acknowledgeSecurityEvent } from "@/server/services/admin";

export const POST = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  await acknowledgeSecurityEvent(user, params.id);
  return { acknowledged: true };
});
