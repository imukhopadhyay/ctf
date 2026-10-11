import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Progress({ value, max = 100, className, label }: { value: number; max?: number; className?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label} className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

const alertTones = {
  info: { cls: "border-info/40 bg-info/10 text-info", Icon: Info },
  success: { cls: "border-success/40 bg-success/10 text-success", Icon: CheckCircle2 },
  warning: { cls: "border-warning/40 bg-warning/10 text-warning", Icon: AlertTriangle },
  danger: { cls: "border-danger/40 bg-danger/10 text-danger", Icon: XCircle },
};

export function Alert({ tone = "info", title, children, className }: { tone?: keyof typeof alertTones; title?: string; children?: React.ReactNode; className?: string }) {
  const { cls, Icon } = alertTones[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border p-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-fg">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-fg/85">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon?: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      {Icon && <Icon className="h-8 w-8 text-subtle" />}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon: Icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-surface/90 p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted">
        <span>{label}</span>
        {Icon && <Icon className="h-4 w-4 text-primary" />}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold text-fg">{value}</div>
      {sub && <div className="mt-1 text-xs text-subtle">{sub}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 font-mono text-xs uppercase tracking-widest text-primary">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-fg md:text-3xl">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
