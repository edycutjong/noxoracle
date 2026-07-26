// Gateway self-serve smoke: proves `encryptInput` works with ONLY a funded EOA (no account, key, or
// allowlist) against gateway-testnets.noxprotocol.dev, and that the returned handle decodes as a
// Sepolia uint256. No transaction is sent (encryptInput is an off-chain gateway call). No gas.
import { provider, deployer, handleClient, readDeployments } from './lib/nox.mjs';
import { describeHandle } from '../packages/confidential-ctf/src/handles.js';

async function main() {
  const p = provider();
  const w = deployer(p);
  const bal = await p.getBalance(w.address);
  console.log(`EOA ${w.address}  balance ${bal} wei`);

  const app = readDeployments().contracts?.NoxOraclePool?.address || w.address;
  const hc = await handleClient(w);
  const { handle, handleProof } = await hc.encryptInput(500n, 'uint256', app);
  console.log(`encryptInput OK — handle ${handle}`);
  console.log('  decoded:', describeHandle(handle));
  console.log(`  proof bytes: ${(handleProof.length - 2) / 2}`);
  console.log('\n✅ Gateway self-serve confirmed (funded EOA only; no tx, no gas).');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
