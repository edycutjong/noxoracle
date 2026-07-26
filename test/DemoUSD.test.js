const { expect } = require("chai");
const { ethers } = require("hardhat");

// The underlying ERC-20 (runs on local Hardhat — no Nox/TEE needed). Confidential paths are covered
// end-to-end by NoxOraclePool.test.js (via the transparent MockNoxCompute) and proven on Sepolia by
// the live e2e script.
describe("DemoUSD", function () {
  let demo, owner, alice;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    demo = await (await ethers.getContractFactory("DemoUSD")).deploy();
    await demo.waitForDeployment();
  });

  it("uses 6 decimals (mirrors USDC)", async () => expect(await demo.decimals()).to.equal(6));
  it("has name/symbol dUSD", async () => {
    expect(await demo.symbol()).to.equal("dUSD");
    expect(await demo.name()).to.equal("Demo USD");
  });
  it("mints 1,000,000 to the deployer", async () =>
    expect(await demo.balanceOf(owner.address)).to.equal(1_000_000n * 10n ** 6n));
  it("faucet mints 1,000 to the caller", async () => {
    await demo.connect(alice).faucet();
    expect(await demo.balanceOf(alice.address)).to.equal(1_000n * 10n ** 6n);
  });
  it("FAUCET_AMOUNT is 1,000e6", async () => expect(await demo.FAUCET_AMOUNT()).to.equal(1_000n * 10n ** 6n));
  it("mint(to, amount) credits an arbitrary account (seed convenience)", async () => {
    await demo.mint(alice.address, 4242n);
    expect(await demo.balanceOf(alice.address)).to.equal(4242n);
  });
  it("supports approve + transferFrom (wrap prerequisite)", async () => {
    await demo.approve(alice.address, 500n);
    await demo.connect(alice).transferFrom(owner.address, alice.address, 500n);
    expect(await demo.balanceOf(alice.address)).to.equal(500n);
  });
  it("reverts transfer above balance", async () =>
    expect(demo.connect(alice).transfer(owner.address, 1n)).to.be.reverted);
});
