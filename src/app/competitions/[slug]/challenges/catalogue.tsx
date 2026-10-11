"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Lock, Search, Server, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Progress } from "@/components/ui/misc";
import { CategoryIcon } from "@/components/category-icon";
import { DifficultyBadge, StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export interface CatalogueChallenge {
  id: string;
  title: string;
  difficulty: string;
  category: { slug: string; name: string };
  subcategory: string | null;
  value: number;
  solves: number;
  solved: boolean;
  locked: boolean;
  closed: boolean;
  tags: string[];
  skills: string[];
  estimatedMinutes: number | null;
  accessMethod: string;
  gradingMode: string;
  status?: string;
}

export function ChallengeCatalogue({ slug, challenges, isStaff }: { slug: string; challenges: CatalogueChallenge[]; isStaff: boolean }) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [state, setState] = useState("");

  const categories = useMemo(() => [...new Map(challenges.map((c) => [c.category.slug, c.category])).values()], [challenges]);
  const filtered = challenges.filter((c) => {
    const needle = q.trim().toLowerCase();
    if (needle && ![c.title, c.subcategory ?? "", ...c.tags, ...c.skills].some((s) => s.toLowerCase().includes(needle))) return false;
    if (category && c.category.slug !== category) return false;
    if (difficulty && c.difficulty !== difficulty) return false;
    if (state === "solved" && !c.solved) return false;
    if (state === "unsolved" && c.solved) return false;
    return true;
  });
  const solved = challenges.filter((c) => c.solved).length;

  return (
    <div className="space-y-5">
      {!isStaff && challenges.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-4">
          <div className="font-mono text-sm"><span className="text-xl font-semibold text-primary">{solved}</span> / {challenges.length} solved</div>
          <Progress value={solved} max={challenges.length} className="flex-1" label="Challenges solved" />
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-subtle" />
          <Input aria-label="Search challenges" placeholder="Search title, tag or skill…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </Select>
        <Select aria-label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">All difficulties</option>
          {["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}
        </Select>
        <Select aria-label="Status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">Solved & unsolved</option>
          <option value="unsolved">Unsolved</option>
          <option value="solved">Solved</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Search} title={challenges.length ? "No challenges match your filters" : "No challenges published yet"} />
      ) : (
        categories
          .filter((cat) => filtered.some((c) => c.category.slug === cat.slug))
          .map((cat) => (
            <section key={cat.slug} aria-labelledby={`cat-${cat.slug}`}>
              <h2 id={`cat-${cat.slug}`} className="mb-3 flex items-center gap-2 text-lg font-semibold"><CategoryIcon slug={cat.slug} className="h-5 w-5 text-primary" />{cat.name}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.filter((c) => c.category.slug === cat.slug).map((c) => (
                  <Link key={c.id} href={`/competitions/${slug}/challenges/${c.id}`} className="group">
                    <Card className={cn("h-full p-4 transition-colors group-hover:border-border-strong", c.solved && "border-success/40 bg-success/5", c.locked && "opacity-70")}>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold group-hover:text-primary">{c.title}</h3>
                        <span className="font-mono text-lg font-semibold text-primary">{c.value}</span>
                      </div>
                      {c.subcategory && <p className="text-xs text-muted">{c.subcategory}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <DifficultyBadge difficulty={c.difficulty} />
                        {c.solved && <Badge tone="success"><CheckCircle2 className="h-3 w-3" />solved</Badge>}
                        {c.locked && <Badge tone="muted"><Lock className="h-3 w-3" />locked</Badge>}
                        {c.closed && <Badge tone="muted">closed</Badge>}
                        {c.accessMethod === "INSTANCE" && <Badge tone="info"><Server className="h-3 w-3" />instance</Badge>}
                        {c.gradingMode === "MANUAL" && <Badge tone="warning">write-up</Badge>}
                        {isStaff && c.status && <StatusBadge status={c.status} />}
                      </div>
                      <div className="mt-3 flex items-center gap-3 text-xs text-subtle">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.solves} solve{c.solves === 1 ? "" : "s"}</span>
                        {c.estimatedMinutes && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{c.estimatedMinutes} min</span>}
                      </div>
                      {c.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{c.tags.slice(0, 4).map((t) => <span key={t} className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">#{t}</span>)}</div>}
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
