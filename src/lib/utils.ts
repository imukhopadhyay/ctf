import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDateTime(d: Date | string | null | undefined, timeZone?: string): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // Note: `dateStyle`/`timeStyle` cannot be combined with explicit component
  // options like `timeZoneName`, so we spell out the components.
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timeZone || "UTC",
    timeZoneName: "short",
  }).format(date);
}

export function relativeTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export const DIFFICULTY_LABEL: Record<string, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced",
  EXPERT: "Expert",
};

export const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info" | "muted"> = {
  DRAFT: "muted",
  SCHEDULED: "info",
  ACTIVE: "success",
  PAUSED: "warning",
  COMPLETED: "default",
  ARCHIVED: "muted",
  IN_REVIEW: "warning",
  APPROVED: "info",
  PUBLISHED: "success",
  RETIRED: "muted",
  RUNNING: "success",
  PROVISIONING: "info",
  STOPPED: "muted",
  EXPIRED: "muted",
  FAILED: "danger",
  PENDING: "warning",
  REJECTED: "danger",
  WITHDRAWN: "muted",
  CORRECT: "success",
  INCORRECT: "danger",
  ALREADY_SOLVED: "muted",
  PENDING_REVIEW: "warning",
  REJECTED_REVIEW: "danger",
};
