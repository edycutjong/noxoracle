const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { deployAll, commit, fundWrap, val, e6 } = require("./helpers/market");

const advance = async (s) => {
  await network.provider.send("evm_increaseTime", [s]);
  await network.provider.send("evm_mine");
};

// Read a confidential cUSD balance in the clear (via the transparent mock).
async function cbal(ctx, addr) {
  const h = await ctx.cUSD.confidentialBalanceOf(addr);
  if (h === ethers.ZeroHash) return 0n;
  return val(ctx.mock, h);
}

// Drive a fresh epoch open → commit(s) → close → executeEpoch (state == AWAITING_UNWRAP).
// `bets` is [{ signer, side, amount }]; needs >= K_MIN entries to close without force.
async function runToAwaitingUnwrap(ctx, bets) {
  await (await ctx.pool.openEpoch(3600)).wait();
  for (const b of bets) await (await commit(ctx, b.signer, b.side, b.amount, b.amount)).wait();
  await advance(3601);
  await (await ctx.pool.closeEpoch(false)).wait();
  await (await ctx.pool.connect(ctx.keeper).executeEpoch()).wait();
}

// ...then finalize the unwrap into the REAL FPMM with public aggregates (state == EXECUTED).
async function runToExecuted(ctx, bets, aggYes, aggNo) {
  await runToAwaitingUnwrap(ctx, bets);
  await (await ctx.pool.connect(ctx.keeper).finalizeEpoch("0x01", aggYes, aggNo, 0, 0)).wait();
}

describe("NoxOraclePool", function () {
  describe("deployment & config", function () {
    let ctx;
    before(async () => (ctx = await deployAll()));

    it("binds the conditionId from oracle+questionId", async () => {
      expect(await ctx.pool.conditionId()).to.equal(ctx.conditionId);
    });
    it("K_MIN is 3", async () => expect(await ctx.pool.K_MIN()).to.equal(3n));
    it("wires cUSD / collateral / ctf / fpmm", async () => {
      expect(await ctx.pool.cUSD()).to.equal(await ctx.cUSD.getAddress());
      expect(await ctx.pool.collateral()).to.equal(await ctx.demoUSD.getAddress());
      expect(await ctx.pool.ctf()).to.equal(await ctx.ctf.getAddress());
      expect(await ctx.pool.fpmm()).to.equal(await ctx.fpmm.getAddress());
    });
    it("discloses the demo oracle EOA", async () => {
      expect(await ctx.pool.oracle()).to.equal(ctx.oracle.address);
    });
  });

  describe("epoch lifecycle guards", function () {
    let ctx;
    beforeEach(async () => (ctx = await deployAll()));

    it("commit reverts before any epoch is opened", async () => {
      await expect(commit(ctx, ctx.alice, "yes", e6(100), e6(100))).to.be.reverted;
    });
    it("openEpoch starts epoch #1 OPEN", async () => {
      await (await ctx.pool.openEpoch(3600)).wait();
      expect(await ctx.pool.currentEpoch()).to.equal(1n);
      expect(await ctx.pool.epochState(1)).to.equal(1); // OPEN
    });
    it("cannot open a second epoch while one is live", async () => {
      await (await ctx.pool.openEpoch(3600)).wait();
      await expect(ctx.pool.openEpoch(3600)).to.be.revertedWithCustomError(ctx.pool, "PriorEpochLive");
    });
    it("closeEpoch reverts while the commit window is open", async () => {
      await (await ctx.pool.openEpoch(3600)).wait();
      await expect(ctx.pool.closeEpoch(false)).to.be.revertedWithCustomError(ctx.pool, "CommitWindowOpen");
    });
    it("commit reverts after the window closes", async () => {
      await (await ctx.pool.openEpoch(3600)).wait();
      await advance(3601);
      await expect(commit(ctx, ctx.alice, "yes", e6(100), e6(100))).to.be.revertedWithCustomError(
        ctx.pool,
        "CommitWindowClosed",
      );
    });
  });

  describe("dual-handle privacy & aggregation", function () {
    let ctx;
    before(async () => {
      ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
      await (await commit(ctx, ctx.alice, "yes", e6(1000), e6(1000))).wait();
      await (await commit(ctx, ctx.bob, "yes", e6(500), e6(500))).wait();
      await (await commit(ctx, ctx.carol, "yes", e6(200), e6(200))).wait();
      await (await commit(ctx, ctx.dana, "no", e6(500), e6(500))).wait();
    });

    it("a commit is always two handles — nothing on-chain distinguishes YES from NO", async () => {
      // Every bettor's stored stake pair has both a YES and a NO handle; direction is invisible.
      for (const who of [ctx.alice, ctx.dana]) {
        const [y, n] = await ctx.pool.myStakes(1, who.address);
        expect(y).to.match(/^0x[0-9a-f]{64}$/i);
        expect(n).to.match(/^0x[0-9a-f]{64}$/i);
      }
    });
    it("epoch aggregates equal the sum of stakes (I1)", async () => {
      const [sy, sn] = await ctx.pool.sumHandles(1);
      expect(await val(ctx.mock, sy)).to.equal(e6(1700));
      expect(await val(ctx.mock, sn)).to.equal(e6(500));
    });
    it("each bettor decrypts only their own position", async () => {
      const [ay, an] = await ctx.pool.myStakes(1, ctx.alice.address);
      expect(await val(ctx.mock, ay)).to.equal(e6(1000));
      expect(await val(ctx.mock, an)).to.equal(0n);
      const [dy, dn] = await ctx.pool.myStakes(1, ctx.dana.address);
      expect(await val(ctx.mock, dy)).to.equal(0n);
      expect(await val(ctx.mock, dn)).to.equal(e6(500));
    });
    it("participant count tracks unique committers", async () => {
      const info = await ctx.pool.epochInfo(1);
      expect(info.participantCount).to.equal(4);
    });
    it("pooled custody: the pool holds the full 2,200 cUSD; bettors hold nothing", async () => {
      expect(await cbal(ctx, await ctx.pool.getAddress())).to.equal(e6(2200));
      expect(await cbal(ctx, ctx.alice.address)).to.equal(0n);
      expect(await cbal(ctx, ctx.dana.address)).to.equal(0n);
    });
    it("cross-epoch netting accumulates encrypted exposure (Tier A)", async () => {
      const [ny, nn] = await ctx.pool.netExposure(ctx.dana.address);
      expect(await val(ctx.mock, ny)).to.equal(0n);
      expect(await val(ctx.mock, nn)).to.equal(e6(500));
    });
    it("admin-minimality: over a user's stake handle, isAllowed==false while isViewer==true", async () => {
      const [ay] = await ctx.pool.myStakes(1, ctx.alice.address);
      expect(await ctx.mock.isAllowed(ay, ctx.alice.address)).to.equal(false);
      // pool (the sole admin) is allowed; user is viewer-only
      expect(await ctx.mock.isViewer(ay, ctx.alice.address)).to.equal(true);
      expect(await ctx.mock.isAllowed(ay, await ctx.pool.getAddress())).to.equal(true);
    });
  });

  describe("k-anonymity gate", function () {
    let ctx;
    beforeEach(async () => {
      ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
    });

    it("closeEpoch reverts below k=3 (sub-k epochs never reveal)", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await advance(3601);
      await expect(ctx.pool.closeEpoch(false))
        .to.be.revertedWithCustomError(ctx.pool, "KAnonymityNotMet")
        .withArgs(1, 3);
    });
    it("force reveals the deliberately-bad epoch (k=1 exhibit)", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await advance(3601);
      await (await ctx.pool.closeEpoch(true)).wait();
      expect(await ctx.pool.epochState(1)).to.equal(2); // AWAITING_DECRYPT
    });
    it("closes normally at k>=3", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await (await commit(ctx, ctx.bob, "no", e6(100), e6(100))).wait();
      await (await commit(ctx, ctx.carol, "yes", e6(100), e6(100))).wait();
      await advance(3601);
      await (await ctx.pool.closeEpoch(false)).wait();
      expect(await ctx.pool.epochState(1)).to.equal(2);
    });
    it("kAnonymitySatisfied computes an encrypted le(K_MIN, count) and reveals just the bool", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await (await commit(ctx, ctx.bob, "no", e6(100), e6(100))).wait();
      await (await commit(ctx, ctx.carol, "yes", e6(100), e6(100))).wait();
      const okHandle = await ctx.pool.kAnonymitySatisfied.staticCall(1);
      await (await ctx.pool.kAnonymitySatisfied(1)).wait();
      expect(await ctx.mock.value(okHandle)).to.equal(1n); // 3 <= 3
    });
  });

  describe("full confidential cycle: commit → close → execute → finalize → settle → claim", function () {
    let ctx, sumYesH, sumNoH, unwrapH;
    before(async () => {
      ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
      await (await commit(ctx, ctx.alice, "yes", e6(1000), e6(1000))).wait();
      await (await commit(ctx, ctx.bob, "yes", e6(500), e6(500))).wait();
      await (await commit(ctx, ctx.carol, "yes", e6(200), e6(200))).wait();
      await (await commit(ctx, ctx.dana, "no", e6(500), e6(500))).wait();
      await advance(3601);
      await (await ctx.pool.closeEpoch(false)).wait();
      [sumYesH, sumNoH] = await ctx.pool.sumHandles(1);
      await (await ctx.pool.connect(ctx.keeper).executeEpoch()).wait();
      unwrapH = await ctx.pool.unwrapId(1);
      // Keeper reads the public aggregates off-chain (1700 / 500) and routes them into the FPMM.
      await (await ctx.pool.connect(ctx.keeper).finalizeEpoch("0x01", e6(1700), e6(500), 0, 0)).wait();
    });

    it("execute burned the pool's pooled cUSD (all-or-nothing)", async () => {
      expect(await cbal(ctx, await ctx.pool.getAddress())).to.equal(0n);
    });
    it("finalize routed the exact aggregates into the REAL FPMM (I3)", async () => {
      const info = await ctx.pool.epochInfo(1);
      expect(info.plainYes).to.equal(e6(1700));
      expect(info.plainNo).to.equal(e6(500));
      expect(info.boughtYes).to.be.greaterThan(0n);
      expect(info.boughtNo).to.be.greaterThan(0n);
      expect(await ctx.pool.epochState(1)).to.equal(4); // EXECUTED
    });
    it("the pool holds ALL outcome tokens; no bettor wallet is position-shaped", async () => {
      const poolAddr = await ctx.pool.getAddress();
      expect(await ctx.ctf.balanceOf(poolAddr, ctx.positions.no)).to.be.greaterThan(0n);
      expect(await ctx.ctf.balanceOf(ctx.dana.address, ctx.positions.no)).to.equal(0n);
      expect(await ctx.ctf.balanceOf(ctx.alice.address, ctx.positions.yes)).to.equal(0n);
    });
    it("I2: ONLY the two aggregates and the unwrap id were ever made publicly decryptable", async () => {
      const len = Number(await ctx.mock.publicDecryptionLogLength());
      const logged = [];
      for (let i = 0; i < len; i++) logged.push((await ctx.mock.publicDecryptionLog(i)).toLowerCase());
      const allowed = new Set([sumYesH, sumNoH, unwrapH].map((h) => h.toLowerCase()));
      for (const h of logged) expect(allowed.has(h), `stray public reveal ${h}`).to.equal(true);
      // and no per-user stake handle leaked
      for (const who of [ctx.alice, ctx.bob, ctx.carol, ctx.dana]) {
        const [y, n] = await ctx.pool.myStakes(1, who.address);
        expect(logged).to.not.include(y.toLowerCase());
        expect(logged).to.not.include(n.toLowerCase());
      }
    });

    it("settles NO-wins: redeems the pot and fixes a PUBLIC rate", async () => {
      await (await ctx.ctf.connect(ctx.oracle).reportPayouts(ctx.questionId, [0, 1])).wait();
      await (await ctx.pool.settle()).wait();
      expect(await ctx.pool.marketSettled()).to.equal(true);
      expect(await ctx.pool.winner()).to.equal(1n); // NO
      expect(await ctx.pool.poolRateDen()).to.equal(e6(500)); // winning pool = Σ NO aggregate
      expect(await ctx.pool.poolRateNum()).to.be.greaterThan(0n); // pot
    });
    it("the dissenter claims a SEALED payout at the public rate", async () => {
      const pot = await ctx.pool.poolRateNum();
      await (await ctx.pool.connect(ctx.dana).claim(1)).wait();
      // Dana is the sole NO bettor: payout = 500 * pot / 500 = pot, paid in cUSD.
      expect(await cbal(ctx, ctx.dana.address)).to.equal(pot);
    });
    it("losers claim zero (winning stake is an encrypted zero)", async () => {
      await (await ctx.pool.connect(ctx.alice).claim(1)).wait();
      expect(await cbal(ctx, ctx.alice.address)).to.equal(0n);
    });
    it("I4: Σ payouts ≤ pot", async () => {
      // Dana already claimed the whole pot; Bob/Carol claim 0.
      const pot = await ctx.pool.poolRateNum();
      await (await ctx.pool.connect(ctx.bob).claim(1)).wait();
      await (await ctx.pool.connect(ctx.carol).claim(1)).wait();
      const paid = await cbal(ctx, ctx.dana.address);
      expect(paid).to.be.lessThanOrEqual(pot);
    });
    it("double-claim reverts", async () => {
      await expect(ctx.pool.connect(ctx.dana).claim(1)).to.be.revertedWithCustomError(
        ctx.pool,
        "AlreadyClaimed",
      );
    });
    it("claim before settlement reverts (fresh pool)", async () => {
      const fresh = await deployAll();
      await (await fresh.pool.openEpoch(3600)).wait();
      await expect(fresh.pool.connect(fresh.alice).claim(1)).to.be.revertedWithCustomError(
        fresh.pool,
        "NotResolved",
      );
    });
  });

  describe("refund path (keeper/market stalls)", function () {
    let ctx;
    before(async () => {
      ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
      await (await commit(ctx, ctx.alice, "yes", e6(1000), e6(1000))).wait();
      await (await commit(ctx, ctx.bob, "no", e6(400), e6(400))).wait();
      await (await commit(ctx, ctx.carol, "yes", e6(200), e6(200))).wait();
      await advance(3601);
      await (await ctx.pool.closeEpoch(false)).wait();
      // keeper never executes; funds still in custody -> refunds enabled.
    });

    it("returns each staker's full contribution as sealed cUSD (rate = 1)", async () => {
      await (await ctx.pool.connect(ctx.alice).refundEpoch(1)).wait();
      await (await ctx.pool.connect(ctx.bob).refundEpoch(1)).wait();
      expect(await cbal(ctx, ctx.alice.address)).to.equal(e6(1000));
      expect(await cbal(ctx, ctx.bob.address)).to.equal(e6(400));
      expect(await ctx.pool.epochState(1)).to.equal(6); // REFUNDING
    });
    it("double-refund reverts", async () => {
      await expect(ctx.pool.connect(ctx.alice).refundEpoch(1)).to.be.revertedWithCustomError(
        ctx.pool,
        "AlreadyClaimed",
      );
    });
  });

  describe("state-machine guards (negative paths)", function () {
    let ctx;
    beforeEach(async () => {
      ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
    });

    it("executeEpoch reverts unless the epoch is AWAITING_DECRYPT", async () => {
      await expect(ctx.pool.executeEpoch()).to.be.revertedWithCustomError(ctx.pool, "WrongState");
    });
    it("finalizeEpoch reverts unless the epoch is AWAITING_UNWRAP", async () => {
      await expect(ctx.pool.finalizeEpoch("0x01", 0, 0, 0, 0)).to.be.revertedWithCustomError(
        ctx.pool,
        "WrongState",
      );
    });
    it("closeEpoch reverts once the epoch is no longer OPEN", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await advance(3601);
      await (await ctx.pool.closeEpoch(true)).wait(); // force -> AWAITING_DECRYPT
      await expect(ctx.pool.closeEpoch(true)).to.be.revertedWithCustomError(ctx.pool, "WrongState");
    });
    it("settle reverts before the oracle resolves (NotResolved)", async () => {
      await expect(ctx.pool.settle()).to.be.revertedWithCustomError(ctx.pool, "NotResolved");
    });
    it("settle reverts when resolved but no epoch was executed (NothingToSettle)", async () => {
      await (await ctx.ctf.connect(ctx.oracle).reportPayouts(ctx.questionId, [0, 1])).wait();
      await expect(ctx.pool.settle()).to.be.revertedWithCustomError(ctx.pool, "NothingToSettle");
    });
    it("refundEpoch reverts while the commit window is still open", async () => {
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await expect(ctx.pool.connect(ctx.alice).refundEpoch(1)).to.be.revertedWithCustomError(
        ctx.pool,
        "CommitWindowOpen",
      );
    });
  });

  describe("commit idempotence", function () {
    it("a repeat commit by the same bettor never double-counts participants", async () => {
      const ctx = await deployAll();
      await (await ctx.pool.openEpoch(3600)).wait();
      await (await commit(ctx, ctx.alice, "yes", e6(100), e6(100))).wait();
      await (await commit(ctx, ctx.alice, "yes", e6(50), e6(50))).wait();
      const info = await ctx.pool.epochInfo(1);
      expect(info.participantCount).to.equal(1);
      // the two commits accumulate into one encrypted ledger (100 + 50)
      const [y] = await ctx.pool.myStakes(1, ctx.alice.address);
      expect(await val(ctx.mock, y)).to.equal(e6(150));
    });
  });

  describe("execution edges: single-sided aggregates", function () {
    it("all-YES epoch skips the NO buy (plainNo == 0)", async () => {
      const ctx = await deployAll();
      await runToExecuted(
        ctx,
        [
          { signer: ctx.alice, side: "yes", amount: e6(100) },
          { signer: ctx.bob, side: "yes", amount: e6(100) },
          { signer: ctx.carol, side: "yes", amount: e6(100) },
        ],
        e6(300),
        0n,
      );
      const info = await ctx.pool.epochInfo(1);
      expect(info.plainYes).to.equal(e6(300));
      expect(info.plainNo).to.equal(0n);
      expect(info.boughtYes).to.be.greaterThan(0n);
      expect(info.boughtNo).to.equal(0n); // NO branch never entered
      expect(await ctx.pool.epochState(1)).to.equal(4); // EXECUTED
    });
    it("all-NO epoch skips the YES buy (plainYes == 0)", async () => {
      const ctx = await deployAll();
      await runToExecuted(
        ctx,
        [
          { signer: ctx.alice, side: "no", amount: e6(100) },
          { signer: ctx.bob, side: "no", amount: e6(100) },
          { signer: ctx.carol, side: "no", amount: e6(100) },
        ],
        0n,
        e6(300),
      );
      const info = await ctx.pool.epochInfo(1);
      expect(info.plainYes).to.equal(0n);
      expect(info.plainNo).to.equal(e6(300));
      expect(info.boughtYes).to.equal(0n); // YES branch never entered
      expect(info.boughtNo).to.be.greaterThan(0n);
    });
  });

  describe("finalize integrity", function () {
    it("reverts when the public aggregates != the truly-unwrapped amount", async () => {
      const ctx = await deployAll();
      await runToAwaitingUnwrap(ctx, [
        { signer: ctx.alice, side: "yes", amount: e6(100) },
        { signer: ctx.bob, side: "yes", amount: e6(100) },
        { signer: ctx.carol, side: "yes", amount: e6(100) },
      ]);
      // real unwrap releases 300; claiming 2 must fail the spend-bound require.
      await expect(
        ctx.pool.connect(ctx.keeper).finalizeEpoch("0x01", e6(1), e6(1), 0, 0),
      ).to.be.revertedWith("aggregate != unwrapped");
    });
  });

  describe("YES-wins settlement, claim, and epoch re-open", function () {
    let ctx;
    before(async () => {
      ctx = await deployAll();
      await runToExecuted(
        ctx,
        [
          { signer: ctx.alice, side: "yes", amount: e6(600) },
          { signer: ctx.bob, side: "yes", amount: e6(400) },
          { signer: ctx.dana, side: "no", amount: e6(500) },
        ],
        e6(1000),
        e6(500),
      );
      await (await ctx.ctf.connect(ctx.oracle).reportPayouts(ctx.questionId, [1, 0])).wait(); // YES wins
      await (await ctx.pool.settle()).wait();
    });

    it("winner is YES and the winning pool is the Σ YES aggregate", async () => {
      expect(await ctx.pool.winner()).to.equal(0n); // YES
      expect(await ctx.pool.poolRateDen()).to.equal(e6(1000));
      expect(await ctx.pool.poolRateNum()).to.be.greaterThan(0n); // pot
    });
    it("a YES bettor claims a sealed payout proportional to their winning stake", async () => {
      const pot = await ctx.pool.poolRateNum();
      await (await ctx.pool.connect(ctx.alice).claim(1)).wait();
      // alice held 600 of the winning 1000 pool: payout = 600 * pot / 1000.
      expect(await cbal(ctx, ctx.alice.address)).to.equal((e6(600) * pot) / e6(1000));
    });
    it("executedEpochCount reflects the single executed epoch", async () => {
      expect(await ctx.pool.executedEpochCount()).to.equal(1n);
    });
    it("double-settle reverts (AlreadyResolved)", async () => {
      await expect(ctx.pool.settle()).to.be.revertedWithCustomError(ctx.pool, "AlreadyResolved");
    });
    it("a fresh epoch can be opened once the prior one has SETTLED", async () => {
      await (await ctx.pool.openEpoch(3600)).wait();
      expect(await ctx.pool.currentEpoch()).to.equal(2n);
      expect(await ctx.pool.epochState(2)).to.equal(1); // OPEN
    });
  });

  describe("settlement edge: nobody bet the winning side (pot == 0)", function () {
    it("settles with a zero pot and skips the wrap-back", async () => {
      const ctx = await deployAll();
      await runToExecuted(
        ctx,
        [
          { signer: ctx.alice, side: "no", amount: e6(100) },
          { signer: ctx.bob, side: "no", amount: e6(100) },
          { signer: ctx.carol, side: "no", amount: e6(100) },
        ],
        0n,
        e6(300),
      );
      // YES wins, but the pool holds only (now-worthless) NO outcome tokens.
      await (await ctx.ctf.connect(ctx.oracle).reportPayouts(ctx.questionId, [1, 0])).wait();
      await (await ctx.pool.settle()).wait();
      expect(await ctx.pool.winner()).to.equal(0n); // YES
      expect(await ctx.pool.poolRateNum()).to.equal(0n); // pot == 0 -> wrap-back skipped
      expect(await ctx.pool.marketSettled()).to.equal(true);
    });
  });

  describe("refund guards after funds leave custody", function () {
    const yyn = (ctx) => [
      { signer: ctx.alice, side: "yes", amount: e6(100) },
      { signer: ctx.bob, side: "yes", amount: e6(100) },
      { signer: ctx.carol, side: "no", amount: e6(100) },
    ];

    it("refundEpoch reverts once the epoch is EXECUTED (funds in the market)", async () => {
      const ctx = await deployAll();
      await runToExecuted(ctx, yyn(ctx), e6(200), e6(100));
      await expect(ctx.pool.connect(ctx.alice).refundEpoch(1)).to.be.revertedWithCustomError(
        ctx.pool,
        "WrongState",
      );
    });
    it("refundEpoch reverts once the epoch is SETTLED", async () => {
      const ctx = await deployAll();
      await runToExecuted(ctx, yyn(ctx), e6(200), e6(100));
      await (await ctx.ctf.connect(ctx.oracle).reportPayouts(ctx.questionId, [0, 1])).wait();
      await (await ctx.pool.settle()).wait();
      await expect(ctx.pool.connect(ctx.alice).refundEpoch(1)).to.be.revertedWithCustomError(
        ctx.pool,
        "WrongState",
      );
    });
  });

  describe("ERC-1155 receiver hooks", function () {
    it("acknowledges both single and batch outcome-token transfers", async () => {
      const ctx = await deployAll();
      const z = ethers.ZeroAddress;
      expect(await ctx.pool.onERC1155Received(z, z, 0, 0, "0x")).to.equal("0xf23a6e61");
      expect(await ctx.pool.onERC1155BatchReceived(z, z, [], [], "0x")).to.equal("0xbc197c81");
    });
  });
});
