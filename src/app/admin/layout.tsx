import Link from "next/link";
import { requirePlatformPermission } from "@/server/auth/current";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformPermission("platform.audit.view");
  const links = [["/admin", "Overview"], ["/admin/users", "Users"], ["/admin/audit", "Audit log"], ["/admin/security", "Security"], ["/admin/settings", "Settings"]];
  return (
    <div>
      <nav aria-label="Administration" className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2">
        {links.map(([href, label]) => <Link key={href} href={href} className="rounded px-3 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-fg">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
