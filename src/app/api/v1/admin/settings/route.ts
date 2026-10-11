import { route } from "@/server/http/api";
import { getSettings, settingsSchema, updateSettings, type PlatformSettings } from "@/server/services/settings";
import { requirePlatform } from "@/server/services/access";

export const GET = route({ auth: "required" }, async ({ user }) => {
  await requirePlatform(user, "platform.settings.manage");
  return getSettings();
});
export const PATCH = route<Record<string, string>, Partial<PlatformSettings>>(
  { auth: "required", body: settingsSchema.partial().strict() },
  async ({ user, body }) => updateSettings(user, body),
);
