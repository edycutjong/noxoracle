import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import { NETWORK } from './config';

// Injected connector only — the wallet you already have (MetaMask / Rabby) stays untouched.
export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(NETWORK.rpcUrl) },
  ssr: true,
});
