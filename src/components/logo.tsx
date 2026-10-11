export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
        <path d="M16 2 4 7v8c0 7.2 5.1 13.4 12 15 6.9-1.6 12-7.8 12-15V7L16 2Z" fill="none" stroke="var(--color-primary)" strokeWidth="2" />
        <path d="M11 11v11M11 11h9l-2 3 2 3h-9" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="font-mono text-sm font-bold tracking-tight">
          Cyber<span className="text-primary">Quest</span> <span className="text-muted">CTF</span>
        </span>
      )}
    </span>
  );
}
