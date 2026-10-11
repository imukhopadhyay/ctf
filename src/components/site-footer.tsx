import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted md:flex-row md:items-center md:justify-between">
        <p>CyberQuest CTF — practise offensive and defensive security, legally and safely.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-4">
          <Link href="/help#rules" className="hover:text-fg">Rules</Link>
          <Link href="/help#responsible-use" className="hover:text-fg">Responsible use</Link>
          <Link href="/help#faq" className="hover:text-fg">FAQ</Link>
          <a href="/api/health" className="hover:text-fg">Status</a>
        </nav>
      </div>
    </footer>
  );
}
