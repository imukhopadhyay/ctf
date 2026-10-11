import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "border-border-strong text-fg bg-surface-2",
  success: "border-success/40 text-success bg-success/10",
  warning: "border-warning/40 text-warning bg-warning/10",
  danger: "border-danger/40 text-danger bg-danger/10",
  info: "border-info/40 text-info bg-info/10",
  primary: "border-primary/40 text-primary bg-primary/10",
  muted: "border-border text-muted bg-transparent",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "default", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}
