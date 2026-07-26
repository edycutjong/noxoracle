// Protocol-purity hash-check (invariant I5). READ-ONLY — no gas. Compares the ON-CHAIN runtime
// bytecode of the deployed CTF + FPMM implementation master against the published npm artifacts,
// byte-for-byte. Before deployment it prints the expected artifact hashes (the CI baseline).
import { provider, gnosisArtifact, artifactHash, onchainCodeHash, readDeployments } from './lib/nox.mjs';
import { ethers } from 'ethers';

const CTF = gnosisArtifact('@gnosis.pm/conditional-tokens-contracts', 'ConditionalTokens');
const FAC = gnosisArtifact('@gnosis.pm/conditional-tokens-market-makers', 'FixedProductMarketMakerFactory');
const FPMM = gnosisArtifact('@gnosis.pm/conditional-tokens-market-makers', 'FixedProductMarketMaker');

async function main() {
  console.log('Deployment-of-record hash baseline (from npm build artifacts):');
  console.log(`  ConditionalTokens 1.0.3  keccak(deployedBytecode) = ${artifactHash(CTF)}`);
  console.log(`  FPMMFactory 1.8.1        keccak(deployedBytecode) = ${artifactHash(FAC)}`);
  console.log(`  FixedProductMarketMaker  keccak(deployedBytecode) = ${artifactHash(FPMM)}`);
  console.log(`  compiler: ${CTF.compiler.version} (deployed unmodified, NOT recompiled under 0.8.35)`);

  const d = readDeployments();
  const ctfAddr = d.contracts?.ConditionalTokens?.address;
  const facAddr = d.contracts?.FixedProductMarketMakerFactory?.address;
  if (!ctfAddr) {
    console.log('\n(No on-chain deployment yet — run `npm run deploy`. Baseline printed above is the CI check target.)');
    return;
  }

  const p = provider();
  const ctfMatch = (await onchainCodeHash(p, ctfAddr)) === artifactHash(CTF);
  console.log(`\nOn-chain check @ Sepolia:`);
  console.log(`  CTF ${ctfAddr}  ${ctfMatch ? '✅ MATCH' : '❌ MISMATCH'}`);

  if (facAddr) {
    const facMatch = (await onchainCodeHash(p, facAddr)) === artifactHash(FAC);
    console.log(`  FPMMFactory ${facAddr}  ${facMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    const factory = new ethers.Contract(facAddr, ['function implementationMaster() view returns (address)'], p);
    const master = await factory.implementationMaster();
    const fpmmMatch = (await onchainCodeHash(p, master)) === artifactHash(FPMM);
    console.log(`  FPMM master ${master}  ${fpmmMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    process.exit(ctfMatch && facMatch && fpmmMatch ? 0 : 1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
