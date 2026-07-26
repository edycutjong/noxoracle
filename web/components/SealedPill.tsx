'use client';

// A sealed value renders as a violet envelope-pill with a lock. When revealed it unseals in amber
// (or emerald for a settled win). Violet is used EXCLUSIVELY for encrypted/sealed state.
export function SealedPill({
  label,
  revealed,
  value,
  tone = 'amber',
}: {
  label: string;
  revealed?: boolean;
  value?: string;
  tone?: 'amber' | 'emerald';
}) {
  if (revealed) {
    const color = tone === 'emerald' ? 'text-emerald-bright' : 'text-primary-bright';
    return (
      <span className="inline-flex animate-unseal items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-1.5">
        <span className="text-xs text-mid">{label}</span>
        <span className={`tnum text-base font-semibold ${color}`}>{value}</span>
      </span>
    );
  }
  return (
    <span className="sealed inline-flex items-center gap-2 rounded-xl px-3 py-1.5 shadow-sealed">
      <LockIcon />
      <span className="text-xs opacity-80">{label}</span>
      <span className="tnum tracking-widest">••••</span>
    </span>
  );
}

export function LockIcon({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <rect x="4" y="10" width="16" height="10" rx="2" fill="currentColor" opacity="0.85" />
      <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" fill="none" />
    </svg>
  );
}
