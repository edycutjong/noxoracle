const { expect } = require("chai");
const { ethers } = require("hardhat");
const { keccak256 } = ethers;

// Protocol-purity proof (invariant I5), run locally: deploy the Gnosis CTF + FPMM from their
// published npm artifacts and confirm the ON-CHAIN runtime bytecode hashes match the package
// byte-for-byte. The Sepolia deploy (scripts/check_artifacts.mjs) performs the identical check.
const CTF_ART = require("@gnosis.pm/conditional-tokens-contracts/build/contracts/ConditionalTokens.json");
const FAC_ART = require("@gnosis.pm/conditional-tokens-market-makers/build/contracts/FixedProductMarketMakerFactory.json");
const FPMM_ART = require("@gnosis.pm/conditional-tokens-market-makers/build/contracts/FixedProductMarketMaker.json");

describe("Deployment-of-record — unmodified Gnosis artifacts (I5)", function () {
  it("ConditionalTokens v1.0.3 on-chain bytecode == npm artifact (hash-checked)", async () => {
    const [deployer] = await ethers.getSigners();
    const ctf = await new ethers.ContractFactory(CTF_ART.abi, CTF_ART.bytecode, deployer).deploy();
    await ctf.waitForDeployment();
    const onchain = await ethers.provider.getCode(await ctf.getAddress());
    expect(keccak256(onchain)).to.equal(keccak256(CTF_ART.deployedBytecode));
  });

  it("compiler is the pinned solc 0.5.x (not our 0.8.35) — deployed, not recompiled", () => {
    expect(CTF_ART.compiler.version).to.match(/^0\.5\./);
    expect(FPMM_ART.compiler.version).to.match(/^0\.5\./);
  });

  it("FPMM factory v1.8.1 on-chain bytecode == npm artifact (hash-checked)", async () => {
    const [deployer] = await ethers.getSigners();
    const factory = await new ethers.ContractFactory(FAC_ART.abi, FAC_ART.bytecode, deployer).deploy();
    await factory.waitForDeployment();
    const onchain = await ethers.provider.getCode(await factory.getAddress());
    expect(keccak256(onchain)).to.equal(keccak256(FAC_ART.deployedBytecode));
  });

  it("FPMM implementation master == npm artifact; instances are minimal proxies to it", async () => {
    const [deployer, oracle] = await ethers.getSigners();
    const demo = await (await ethers.getContractFactory("DemoUSD")).deploy();
    await demo.waitForDeployment();
    const ctf = await new ethers.ContractFactory(CTF_ART.abi, CTF_ART.bytecode, deployer).deploy();
    await ctf.waitForDeployment();
    const factory = await new ethers.ContractFactory(FAC_ART.abi, FAC_ART.bytecode, deployer).deploy();
    await factory.waitForDeployment();

    // The factory deploys ONE implementation master (unmodified FPMM), then clones it per market.
    const master = await factory.implementationMaster();
    const masterCode = await ethers.provider.getCode(master);
    expect(keccak256(masterCode)).to.equal(keccak256(FPMM_ART.deployedBytecode));

    // Each created market is an EIP-1167 minimal proxy delegating to that master.
    const questionId = keccak256(ethers.toUtf8Bytes("q"));
    await (await ctf.prepareCondition(oracle.address, questionId, 2)).wait();
    const conditionId = await ctf.getConditionId(oracle.address, questionId, 2);
    const rc = await (
      await factory.createFixedProductMarketMaker(await ctf.getAddress(), await demo.getAddress(), [conditionId], 0)
    ).wait();
    let fpmmAddr;
    for (const log of rc.logs) {
      try {
        const p = factory.interface.parseLog(log);
        if (p && p.name === "FixedProductMarketMakerCreation") fpmmAddr = p.args.fixedProductMarketMaker;
      } catch {}
    }
    const proxyCode = (await ethers.provider.getCode(fpmmAddr)).toLowerCase();
    // EIP-1167 minimal proxy embedding the master address.
    expect(proxyCode).to.include(master.slice(2).toLowerCase());
    expect(proxyCode.length).to.be.lessThan(200); // ~45-byte proxy, not a full copy
  });
});
