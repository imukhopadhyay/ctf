import { Binary, FileSearch, Globe, KeyRound, Flag } from "lucide-react";

const ICONS = { web: Globe, crypto: KeyRound, reverse: Binary, forensics: FileSearch } as const;

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = ICONS[slug as keyof typeof ICONS] ?? Flag;
  return <Icon className={className ?? "h-4 w-4"} aria-hidden />;
}
