import { route } from "@/server/http/api";
import { changePassword, changePasswordSchema } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";

export const POST = route(
  { auth: "required", body: changePasswordSchema, rateLimit: { name: "password", limit: 5, window: 900 } },
  async ({ user, body, req }) => {
    await changePassword(user!, body, req.cookies.get(SESSION_COOKIE)?.value);
    return { changed: true };
  },
);
