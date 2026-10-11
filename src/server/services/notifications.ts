import "server-only";
import { db } from "../db";
import { notFound } from "../errors";
import { assertUser, type Actor } from "./access";

export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export async function notifyUser(userId: string, n: NotificationInput) {
  await db.notification.create({ data: { userId, type: n.type, title: n.title.slice(0, 200), body: n.body ?? "", link: n.link } });
}

export async function notifyUsers(userIds: string[], n: NotificationInput) {
  if (userIds.length === 0) return;
  await db.notification.createMany({
    data: [...new Set(userIds)].map((userId) => ({ userId, type: n.type, title: n.title.slice(0, 200), body: n.body ?? "", link: n.link })),
  });
}

/** Notifies every approved participant of a competition. */
export async function notifyCompetition(competitionId: string, n: NotificationInput) {
  const regs = await db.competitionRegistration.findMany({
    where: { competitionId, status: "APPROVED" },
    select: { userId: true },
  });
  await notifyUsers(regs.map((r) => r.userId), n);
}

export async function listNotifications(actor: Actor | null, opts: { unreadOnly?: boolean; take?: number } = {}) {
  assertUser(actor);
  const [items, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: actor.id, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: "desc" },
      take: Math.min(opts.take ?? 30, 100),
    }),
    db.notification.count({ where: { userId: actor.id, readAt: null } }),
  ]);
  return { items, unread };
}

export async function markNotificationsRead(actor: Actor | null, ids: string[] | "all") {
  assertUser(actor);
  if (ids === "all") {
    await db.notification.updateMany({ where: { userId: actor.id, readAt: null }, data: { readAt: new Date() } });
    return;
  }
  const res = await db.notification.updateMany({ where: { userId: actor.id, id: { in: ids } }, data: { readAt: new Date() } });
  if (res.count === 0 && ids.length > 0) throw notFound("Notification");
}
