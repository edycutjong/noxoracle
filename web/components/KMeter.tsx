'use client';

import { kAnonymity } from '@noxoracle/confidential-ctf';

// Honesty gauge: below k=3 we say plainly that aggregates approximate individuals.
export function KMeter({ count }: { count: number }) {
  const k = kAnonymity(count);
  const color =
    k.level === 'private' ? 'text-emerald-bright' : k.level === 'weak' ? 'text-primary' : 'text-red-400';
  const bars = [0, 1, 2].map((i) => {
    const active = count > i;
    const cls = !active ? 'bg-white/10' : k.level === 'private' ? 'bg-emerald' : 'bg-primary';
    return <span key={i} className={`h-2 w-8 rounded-full ${cls}`} />;
  });
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">{bars}</div>
      <span className={`text-xs ${color}`}>{k.label}</span>
    </div>
  );
}
