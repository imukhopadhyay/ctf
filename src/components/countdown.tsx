"use client";
import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

export function Countdown({ target, label }: { target: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="font-mono text-muted">--:--:--</span>;
  const ms = new Date(target).getTime() - now;
  if (ms <= 0) return <span className="font-mono text-muted">{label}: ended</span>;
  const p = parts(ms);
  return (
    <span className="font-mono tabular-nums" aria-live="off">
      <span className="text-muted">{label} </span>
      {p.d > 0 && <>{p.d}d </>}
      {String(p.h).padStart(2, "0")}:{String(p.m).padStart(2, "0")}:{String(p.s).padStart(2, "0")}
    </span>
  );
}
