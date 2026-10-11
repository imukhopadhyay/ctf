import "server-only";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { requirePlatform, type Actor } from "./access";

/** Typed platform settings with defaults. Unknown keys are rejected. */
export const settingsSchema = z.object({
  registrationOpen: z.boolean().default(true),
  maintenanceBanner: z.string().max(280).default(""),
  practiceEnabled: z.boolean().default(true),
  dailyChallengeEnabled: z.boolean().default(true),
  maxInstancesPerSubject: z.number().int().min(1).max(10).default(2),
  publishRequiresReview: z.boolean().default(false),
});
export type PlatformSettings = z.infer<typeof settingsSchema>;
export type SettingKey = keyof PlatformSettings;

const DEFAULTS = settingsSchema.parse({});

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await db.platformSetting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) merged[r.key] = r.value;
  const parsed = settingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULTS;
}

export async function getSetting<K extends SettingKey>(key: K): Promise<PlatformSettings[K]> {
  return (await getSettings())[key];
}

export async function updateSettings(actor: Actor | null, patch: Partial<PlatformSettings>) {
  const user = await requirePlatform(actor, "platform.settings.manage");
  const validated = settingsSchema.partial().strict().parse(patch);
  await db.$transaction(
    Object.entries(validated).map(([key, value]) =>
      db.platformSetting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: user.id },
        update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
      }),
    ),
  );
  await audit({ actorId: user.id, action: "platform.settings.update", metadata: validated });
  return getSettings();
}
