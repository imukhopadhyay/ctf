import Link from "next/link";
import { getCurrentUser } from "@/server/auth/current";
import { getSettings } from "@/server/services/settings";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  return (
    <>
      {settings.maintenanceBanner && (
        <div className="border-b border-warning/30 bg-warning/10 px-4 py-2 text-center text-sm text-warning" role="status">
          {settings.maintenanceBanner}
        </div>
      )}
      <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="CyberQuest CTF home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm md:flex">
            <Link href="/competitions" className="rounded px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">Competitions</Link>
            {user && <Link href="/dashboard" className="rounded px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">Dashboard</Link>}
            <Link href="/help" className="rounded px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">Rules & help</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <NotificationBell />
                <UserMenu user={user} />
              </>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
                <Button asChild size="sm"><Link href="/register">Create account</Link></Button>
              </>
            )}
          </div>
        </div>
        <nav aria-label="Main (mobile)" className="flex gap-1 overflow-x-auto border-t border-border px-4 py-1.5 text-sm md:hidden">
          <Link href="/competitions" className="rounded px-2 py-1 text-muted">Competitions</Link>
          {user && <Link href="/dashboard" className="rounded px-2 py-1 text-muted">Dashboard</Link>}
          <Link href="/help" className="rounded px-2 py-1 text-muted">Help</Link>
        </nav>
      </header>
    </>
  );
}
