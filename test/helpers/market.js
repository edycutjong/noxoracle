// Shared fixture: wires the transparent MockNoxCompute (at the Nox library's hardcoded local
// address) + the REAL reused cUSD wrapper + the UNMODIFIED Gnosis CTF/FPMM (deployed from their
// published npm artifacts) + NoxOraclePool — so the entire confidential cycle runs on local Hardhat.
const { ethers, network, artifacts } = require("hardhat");

const CTF_ART = require("@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json");
const FAC_ART = require("@gnosis.pm/conditional-tokens-market-makers/build/contracts/FixedProductMarketMakerFactory.json");
const FPMM_ART = require("@gnosis.pm/conditional-tokens-market-makers/build/contracts/FixedProductMarketMaker.json");

// The Nox library returns this address for chainId 31337 (see Nox.noxComputeContract()).
const NOX_LOCAL = "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685";

const e6 = (n) => BigInt(Math.round(Number(n) * 1e6));

async function installMock() {
  const art = await artifacts.readArtifact("MockNoxCompute");
  await network.provider.send("hardhat_setCode", [NOX_LOCAL, art.deployedBytecode]);
  const mock = await ethers.getContractAt("MockNoxCompute", NOX_LOCAL);
  // setCode preserves storage across fixtures; isolate the invariant-I2 public-decryption log.
  await (await mock.resetLog()).wait();
  return mock;
}

/** Transparent stand-in for gateway `encryptInput` — returns the fresh external handle + dummy proof. */
async function mockEncrypt(mock, value) {
  const rc = await (await mock.mockEncrypt(value)).wait();
  for (const log of rc.logs) {
    try {
      const p = mock.interface.parseLog(log);
      if (p && p.name === "Encrypted") return { handle: p.args.handle, proof: "0x01" };
    } catch {}
  }
  throw new Error("Encrypted event not found");
}

async function deployAll() {
  const [deployer, oracle, alice, bob, carol, dana, keeper] = await ethers.getSigners();
  const mock = await installMock();

  const demoUSD = await (await ethers.getContractFactory("DemoUSD")).deploy();
  await demoUSD.waitForDeployment();
  const cUSD = await (await ethers.getContractFactory("ConfidentialUSD")).deploy(await demoUSD.getAddress());
  await cUSD.waitForDeployment();

  // Deploy the UNMODIFIED Gnosis CTF + FPMM factory from their published artifacts.
  const ctf = await new ethers.ContractFactory(CTF_ART.abi, CTF_ART.bytecode, deployer).deploy();
  await ctf.waitForDeployment();
  const factory = await new ethers.ContractFactory(FAC_ART.abi, FAC_ART.bytecode, deployer).deploy();
  await factory.waitForDeployment();

  const questionId = ethers.keccak256(ethers.toUtf8Bytes("Will ETH close above $5,000 on Aug 15, 2026?"));
  await (await ctf.prepareCondition(oracle.address, questionId, 2)).wait();
  const conditionId = await ctf.getConditionId(oracle.address, questionId, 2);

  const rc = await (
    await factory.createFixedProductMarketMaker(
      await ctf.getAddress(),
      await demoUSD.getAddress(),
      [conditionId],
      0, // fee = 0 keeps the demo arithmetic clean
    )
  ).wait();
  let fpmmAddr;
  for (const log of rc.logs) {
    try {
      const p = factory.interface.parseLog(log);
      if (p && p.name === "FixedProductMarketMakerCreation") fpmmAddr = p.args.fixedProductMarketMaker;
    } catch {}
  }
  const fpmm = await ethers.getContractAt(FPMM_ART.abi, fpmmAddr, deployer);

  // Seed the FPMM with 2,000 DemoUSD, 50/50 (empty distribution hint).
  await (await demoUSD.mint(deployer.address, e6(2000))).wait();
  await (await demoUSD.approve(fpmmAddr, e6(2000))).wait();
  await (await fpmm.addFunding(e6(2000), [])).wait();

  const pool = await (
    await ethers.getContractFactory("NoxOraclePool")
  ).deploy(await cUSD.getAddress(), await ctf.getAddress(), fpmmAddr, questionId, oracle.address);
  await pool.waitForDeployment();

  const positions = {
    yes: await positionId(ctf, conditionId, 1, await demoUSD.getAddress()),
    no: await positionId(ctf, conditionId, 2, await demoUSD.getAddress()),
  };

  return {
    deployer, oracle, alice, bob, carol, dana, keeper,
    mock, demoUSD, cUSD, ctf, fpmm, factory, pool, conditionId, questionId, positions,
  };
}

async function positionId(ctf, conditionId, indexSet, collateral) {
  const collectionId = await ctf.getCollectionId(ethers.ZeroHash, conditionId, indexSet);
  return ctf.getPositionId(collateral, collectionId);
}

/** Give `signer` `amount` cUSD (mint DemoUSD -> approve -> wrap). */
async function fundWrap(ctx, signer, amount) {
  await (await ctx.demoUSD.mint(signer.address, amount)).wait();
  await (await ctx.demoUSD.connect(signer).approve(await ctx.cUSD.getAddress(), amount)).wait();
  await (await ctx.cUSD.connect(signer).wrap(signer.address, amount)).wait();
}

/** Commit a private bet for `signer` (funds+wraps first if `fund` given). */
async function commit(ctx, signer, side, amount, fund) {
  if (fund !== undefined) await fundWrap(ctx, signer, fund ?? amount);
  const amtYes = side === "yes" ? amount : 0n;
  const amtNo = side === "no" ? amount : 0n;
  const yes = await mockEncrypt(ctx.mock, amtYes);
  const no = await mockEncrypt(ctx.mock, amtNo);
  const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;
  await (await ctx.cUSD.connect(signer).setOperator(await ctx.pool.getAddress(), deadline)).wait();
  return ctx.pool.connect(signer).commitBet(yes.handle, yes.proof, no.handle, no.proof);
}

async function val(mock, handle) {
  return mock.value(handle);
}

module.exports = { deployAll, mockEncrypt, fundWrap, commit, positionId, val, e6, NOX_LOCAL, FPMM_ART, CTF_ART };
