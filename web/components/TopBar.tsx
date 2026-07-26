'use client';

import Link from 'next/link';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { short } from '@/lib/config';

const NAV = [
  ['/', 'Market'],
  ['/position', 'My position'],
  ['/epoch', 'Epoch'],
  ['/verify', 'Verify'],
];

export function TopBar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <header className="flex flex-wrap items-center gap-4 py-6">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-xl font-bold tracking-tight">
          Nox<span className="text-primary">Oracle</span>
        </span>
        <span className="hidden text-xs text-mid sm:inline">bet what you know, not who you are</span>
      </Link>
      <nav className="ml-auto flex flex-wrap items-center justify-end gap-1 text-sm">
        {NAV.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-lg px-3 py-1.5 text-mid transition hover:bg-white/5 hover:text-hi">
            {label}
          </Link>
        ))}
        {isConnected ? (
          <button
            onClick={() => disconnect()}
            className="ml-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary-bright"
          >
            {short(address ?? '')}
          </button>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="ml-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-black shadow-glow"
          >
            Connect
          </button>
        )}
      </nav>
    </header>
  );
}
