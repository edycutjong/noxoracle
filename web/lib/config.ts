// Network + deployment config for the dApp. Mirrors deployments.json; the CTF/FPMM/pool addresses
// are filled on the funded run (NoxOracle ships last in the portfolio).
export const NETWORK = {
  chainId: 11155111,
  name: 'Sepolia',
  rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
  explorer: 'https://sepolia.etherscan.io',
  noxProtocol: '0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf',
  gatewayUrl: 'https://gateway-testnets.noxprotocol.dev',
};

export const CONTRACTS = {
  demoUSD: '0x486c4B8009ACf0BfE26268512F27200e48BD735C', // reused, live
  confidentialUSD: '0x82C281D7403e44d61968c2F49751a56877468991', // reused, live
  conditionalTokens: '0xCd316D0655989fBcedb818b59B7374f62eA734a5', // Gnosis CTF 1.0.3, hash-checked
  fpmmFactory: '0x5c496C1CD31bdfcaD8278E2Af8dE93a6f3Fa7359',
  fpmm: '0xBf4900df1Da779836DFC03a746307fAFBEEf4cc3', // FPMM 1.8.1 instance
  pool: '0xfFba9520699EC4161f41F9bD220e6ce7083d4a2E', // NoxOraclePool (novel), full cycle verified live
};

export const MARKET = {
  question: 'Will ETH close above $5,000 on Aug 15, 2026?',
  questionId: '0x07cae87e207ca7c62d578ea4cf76a3fcc26b3c1351629abd84bb0eb26fb67074',
  conditionId: '0x93719bf941665fdca8d286e19bc2e36daca6abb7b507edc2678ac4ebd5b8b687',
  oracle: '0xd59278A8dCe73224591B259Fe31f28f3cb64629E',
};

export const ARTIFACT_HASHES = {
  conditionalTokens: '0xadf1ee4719c637975ba08765e3a1187f2fb865c9b17386005960a81ff29cfcc7',
  fpmm: '0xa01004f95f5b20663a3263a91373a204b65959896e0aaac1bb1aec428995f62e',
};

export const short = (a: string) => (a && a.startsWith('0x') ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
