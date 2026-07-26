'use client';

// "Unmodified" bytecode hash badge — the protocol-purity proof (invariant I5) worn on the /verify page.
export function HashBadge({ name, version, hash }: { name: string; version: string; hash: string }) {
  return (
    <div className="card flex min-w-0 items-center gap-3 p-4">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/15 text-emerald-bright">✓</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-hi">
          {name} <span className="text-mid">v{version}</span>
        </div>
        <div className="truncate font-mono text-[11px] text-mid">{hash}</div>
        <div className="text-[11px] text-emerald-bright">bytecode ≡ official npm artifact</div>
      </div>
    </div>
  );
}
