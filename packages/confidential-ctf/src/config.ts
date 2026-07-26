// Network + contract configuration. Gateway/subgraph/protocol values match @iexec-nox/handle's
// built-in Sepolia config; contract addresses come from deployments.json. Adapted from NoxSend core.

export interface NoxNetwork {
  chainId: number;
  name: string;
  rpcUrl: string;
  gatewayUrl: string;
  subgraphUrl: string;
  /** NoxCompute protocol contract (ACL + proof validation). */
  noxProtocol: string;
  explorer: string;
}

export const SEPOLIA: NoxNetwork = {
  chainId: 11155111,
  name: 'sepolia',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  gatewayUrl: 'https://gateway-testnets.noxprotocol.dev',
  subgraphUrl:
    'https://thegraph.ethereum-sepolia-testnet.noxprotocol.io/api/subgraphs/id/9CsccKwvgYFo72zZeU4k4wj2NEBLdWhVE3EUandgmzgo',
  // Canonical iExec Nox protocol contract on Sepolia (ACL + proof validation) — fixed infra, not ours.
  noxProtocol: '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf',
  explorer: 'https://sepolia.etherscan.io',
};

export const NETWORKS: Record<number, NoxNetwork> = { [SEPOLIA.chainId]: SEPOLIA };

export function getNetwork(chainId: number): NoxNetwork {
  const n = NETWORKS[chainId];
  if (!n) throw new Error(`Unsupported chainId ${chainId}. Supported: ${Object.keys(NETWORKS).join(', ')}.`);
  return n;
}

export interface NoxOracleContracts {
  /** The confidential participation pool (novel contract). */
  pool: string;
  /** Confidential wrapper token (cUSD) — reused from NoxSend. */
  confidentialUSD: string;
  /** Underlying ERC-20 + FPMM collateral (DemoUSD or Circle USDC). */
  collateral: string;
  /** Unmodified Gnosis Conditional Tokens (v1.0.3), deployed byte-for-byte. */
  conditionalTokens: string;
  /** Unmodified Gnosis FixedProductMarketMaker (v1.8.1) instance. */
  fpmm: string;
}

export interface NoxOracleMarket {
  question: string;
  questionId: string;
  conditionId: string;
  oracle: string;
  outcomeSlotCount: number;
}

export interface NoxOracleConfig {
  network: NoxNetwork;
  contracts: NoxOracleContracts;
  market: NoxOracleMarket;
}

export function explorerTx(net: NoxNetwork, hash: string): string {
  return `${net.explorer}/tx/${hash}`;
}
export function explorerAddress(net: NoxNetwork, address: string): string {
  return `${net.explorer}/address/${address}`;
}

/**
 * Circle USDC on Ethereum Sepolia — canonical external token address, documented primary asset
 * (demo defaults to DemoUSD). Fixed by Circle; not one of our deployments.
 */
export const CIRCLE_USDC_SEPOLIA = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

/**
 * Demo-only default addresses for standalone SDK usage (reused-from-NoxSend Sepolia deployments;
 * do NOT redeploy on the funded run). For the LIVE app these are NOT authoritative: the CLI/scripts
 * derive every address from the committed deployments.json at runtime (see cli loadConfig()). These
 * literals stay hardcoded so the package remains importable standalone without repo-root file access.
 */
export const REUSED_SEPOLIA = {
  demoUSD: '0x486c4B8009ACf0BfE26268512F27200e48BD735C',
  confidentialUSD: '0x82C281D7403e44d61968c2F49751a56877468991',
} as const;
