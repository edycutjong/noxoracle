// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {
    Nox,
    euint256,
    externalEuint256,
    ebool
} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {
    IConditionalTokens,
    IFixedProductMarketMaker,
    IConfidentialUSD
} from "./interfaces/IMarket.sol";

/**
 * @title NoxOraclePool
 * @notice A confidential participation layer for a REAL, unmodified Gnosis Conditional-Tokens
 *         prediction market. The market (CTF + FixedProductMarketMaker) is deployed byte-for-byte
 *         from the official npm artifacts and hash-checked in CI — this contract never touches it
 *         except through the public `buy` / `redeemPositions` surface.
 *
 * ## The privacy model (why direction+size never leak)
 * A bet is committed as TWO encrypted amounts — `(amtYes, amtNo)`, one of them an encrypted zero —
 * so a side bit never exists in plaintext: not in calldata, not in storage, not as a boolean.
 * Observers see two 32-byte handles per commit, always identical in shape.
 *
 * Stakes pool here in confidential cUSD (ERC-7984) under per-user encrypted ledgers
 * (`allowThis` + `addViewer(user)` — the user can always decrypt their own position; nobody else).
 * The pool is the SOLE ADMIN of every stake handle and deliberately never `Nox.allow`s a user
 * (admin ⊇ viewer, and admin grants are irrevocable by design) — admin-minimality as a security
 * property, provable live via `Nox.isAllowed(handle,user)==false` while `isViewer==true`.
 *
 * At epoch close, EXACTLY two handles per epoch are made publicly decryptable — the YES sum and the
 * NO sum (invariant I2). Nothing user-shaped is ever `allowPublicDecryption`'d. The pool then unwraps
 * its OWN pooled cUSD (all-or-nothing ERC-7984 burn — it can't spend what it doesn't hold; the
 * decryption-proof-gated `finalizeUnwrap` releases exactly the burnt USDC) and routes the plaintext
 * aggregates through the real FPMM in one batch, holding ALL outcome tokens itself. Nothing
 * position-shaped ever appears in a user wallet — there is nothing to link.
 *
 * Settlement pays winners in sealed cUSD at a PUBLIC rate (pot / winning-pool, both aggregates):
 * `payout = stakeWin * rateNum / rateDen` computed as encrypted-times-public-scalar — sidestepping
 * the FHE division-by-ciphertext trap. Your win stays yours to disclose.
 *
 * Shared-skeleton origin (disclosed): the cUSD wrapper + Nox integration patterns are adapted from
 * the author's NoxSend entry; this pool contract is original to NoxOracle.
 */
contract NoxOraclePool {
    // ------------------------------------------------------------------ Config

    /// @notice Minimum participants below which an epoch refuses to reveal its aggregates.
    /// Participation (the commit tx sender) is already public on-chain, so this k-gate is a
    /// plaintext invariant; the encrypted `le`-on-count path is exercised in `kAnonymitySatisfied`.
    uint32 public constant K_MIN = 3;

    /// Outcome index / index-set conventions for a binary market.
    uint256 public constant YES_INDEX = 0;
    uint256 public constant NO_INDEX = 1;
    uint256 private constant YES_INDEX_SET = 1; // 0b01
    uint256 private constant NO_INDEX_SET = 2; // 0b10

    IConfidentialUSD public immutable cUSD;
    IERC20 public immutable collateral; // the underlying ERC-20 the wrapper redeems to (USDC/DemoUSD)
    IConditionalTokens public immutable ctf;
    IFixedProductMarketMaker public immutable fpmm;
    bytes32 public immutable conditionId;
    bytes32 public immutable questionId;
    address public immutable oracle; // disclosed demo resolver (reality.eth is the production path)

    // --------------------------------------------------------------- Epoch state

    enum State {
        NONE, // 0 — never opened
        OPEN, // 1 — accepting commits
        AWAITING_DECRYPT, // 2 — closed; aggregates made public; keeper reads them off-chain
        AWAITING_UNWRAP, // 3 — pool cUSD burnt; keeper produces the decryption proof
        EXECUTED, // 4 — FPMM buys done; pool holds outcome tokens
        SETTLED, // 5 — condition resolved, pot redeemed, rate fixed
        REFUNDING // 6 — market/keeper stalled; stakes returned pro-rata
    }

    struct Epoch {
        State state;
        uint64 commitDeadline;
        uint32 participantCount;
        euint256 sumYes; // encrypted epoch YES aggregate
        euint256 sumNo; // encrypted epoch NO aggregate
        euint256 total; // encrypted running total pulled into custody (== sumYes+sumNo)
        euint256 unwrapId; // the publicly-decryptable burn handle (unwrap request id)
        uint256 plainYes; // public after finalize (routed to FPMM)
        uint256 plainNo; // public after finalize
        uint256 boughtYes; // YES outcome tokens acquired
        uint256 boughtNo; // NO outcome tokens acquired
    }

    uint256 public currentEpoch;
    mapping(uint256 => Epoch) private _epochs;

    // Per-user encrypted ledgers (epoch => user => handle). Pool is sole admin; user is a viewer.
    mapping(uint256 => mapping(address => euint256)) private _stakeYes;
    mapping(uint256 => mapping(address => euint256)) private _stakeNo;
    mapping(uint256 => mapping(address => bool)) public committed;
    mapping(uint256 => mapping(address => bool)) public claimed;

    // Confidential cross-epoch netting (Tier A): a user's running exposure never exposes a delta.
    mapping(address => euint256) private _netYes;
    mapping(address => euint256) private _netNo;

    // Pool-level settlement (one market, resolved once; rate is a public fraction).
    uint256[] public executedEpochs;
    bool public marketSettled;
    uint8 public winner; // 0 = YES, 1 = NO (valid once marketSettled)
    uint256 public poolRateNum; // pot (USDC)
    uint256 public poolRateDen; // winning plaintext pool (sum of winning aggregates across executed epochs)

    // ------------------------------------------------------------------- Events

    event EpochOpened(uint256 indexed epoch, uint64 commitDeadline);
    event BetCommitted(uint256 indexed epoch, address indexed bettor, uint32 participantCount);
    event EpochClosed(uint256 indexed epoch, uint32 participantCount);
    event AggregatesRevealed(uint256 indexed epoch, euint256 sumYes, euint256 sumNo);
    event UnwrapRequested(uint256 indexed epoch, euint256 unwrapId);
    event EpochExecuted(uint256 indexed epoch, uint256 plainYes, uint256 plainNo, uint256 boughtYes, uint256 boughtNo);
    event MarketSettled(uint8 winner, uint256 pot, uint256 winningPool);
    event Claimed(uint256 indexed epoch, address indexed bettor);
    event Refunded(uint256 indexed epoch, address indexed bettor);

    // ------------------------------------------------------------------- Errors

    error WrongState(State expected, State actual);
    error CommitWindowClosed();
    error CommitWindowOpen();
    error KAnonymityNotMet(uint32 count, uint32 required);
    error AlreadyClaimed();
    error NotResolved();
    error AlreadyResolved();
    error NothingToSettle();
    error PriorEpochLive();

    constructor(
        IConfidentialUSD cUSD_,
        IConditionalTokens ctf_,
        IFixedProductMarketMaker fpmm_,
        bytes32 questionId_,
        address oracle_
    ) {
        cUSD = cUSD_;
        collateral = IERC20(cUSD_.underlying());
        ctf = ctf_;
        fpmm = fpmm_;
        questionId = questionId_;
        oracle = oracle_;
        conditionId = ctf_.getConditionId(oracle_, questionId_, 2);
        // Let the CTF move the pool's outcome tokens at redemption time.
        ctf_.setApprovalForAll(address(ctf_), true);
    }

    // ============================================================= Epoch control

    /// @notice Open a new commit window. Only when no epoch is live (prior one settled/refunding).
    function openEpoch(uint64 commitWindowSeconds) external returns (uint256 epochId) {
        if (currentEpoch != 0) {
            State s = _epochs[currentEpoch].state;
            if (s != State.SETTLED && s != State.REFUNDING) revert PriorEpochLive();
        }
        epochId = ++currentEpoch;
        Epoch storage e = _epochs[epochId];
        e.state = State.OPEN;
        e.commitDeadline = uint64(block.timestamp) + commitWindowSeconds;
        emit EpochOpened(epochId, e.commitDeadline);
    }

    /**
     * @notice Commit a private bet as two encrypted amounts. Direction is never plaintext.
     * @dev The caller must first grant the pool a time-bound operator on cUSD:
     *      `cUSD.setOperator(pool, commitDeadline)`. `hYes`/`hNo` are produced by
     *      `encryptInput(amount,'uint256', <this pool address>)` client-side; exactly one is a
     *      non-zero stake and the other an encrypted zero (the UI builds both, always).
     *
     *      CRITICAL PRIVACY INVARIANT: BOTH sides are CLIENT-encrypted external inputs — the empty
     *      side is a GATEWAY-encrypted private zero, NEVER a contract-side `Nox.toEuint256(0)`. A
     *      contract-side encrypted-zero literal is a PUBLIC handle whose zero-ness is on-chain
     *      readable; substituting one for the empty side would make "this bettor staked 0 on side X"
     *      publicly provable and leak the direction. This function therefore takes two external
     *      handles and NEVER manufactures a zero — the two commits are always identically shaped.
     */
    function commitBet(
        externalEuint256 hYes,
        bytes calldata pYes,
        externalEuint256 hNo,
        bytes calldata pNo
    ) external {
        Epoch storage e = _epochs[currentEpoch];
        if (e.state != State.OPEN) revert WrongState(State.OPEN, e.state);
        if (block.timestamp >= e.commitDeadline) revert CommitWindowClosed();

        address u = msg.sender;
        euint256 aYes = Nox.fromExternal(hYes, pYes);
        euint256 aNo = Nox.fromExternal(hNo, pNo);

        // Per-user encrypted ledger: accumulate, keep pool as sole admin, add user as viewer.
        euint256 sy = Nox.add(_stakeYes[currentEpoch][u], aYes);
        euint256 sn = Nox.add(_stakeNo[currentEpoch][u], aNo);
        Nox.allowThis(sy);
        Nox.allowThis(sn);
        Nox.addViewer(sy, u);
        Nox.addViewer(sn, u);
        _stakeYes[currentEpoch][u] = sy;
        _stakeNo[currentEpoch][u] = sn;

        // Epoch aggregates (only these two ever become public — invariant I2).
        e.sumYes = Nox.add(e.sumYes, aYes);
        e.sumNo = Nox.add(e.sumNo, aNo);
        Nox.allowThis(e.sumYes);
        Nox.allowThis(e.sumNo);

        // Confidential cross-epoch netting (Tier A) — running exposure, never a per-epoch delta.
        euint256 ny = Nox.add(_netYes[u], aYes);
        euint256 nn = Nox.add(_netNo[u], aNo);
        Nox.allowThis(ny);
        Nox.allowThis(nn);
        Nox.addViewer(ny, u);
        Nox.addViewer(nn, u);
        _netYes[u] = ny;
        _netNo[u] = nn;

        // Pull the total (amtYes+amtNo) into pooled custody via the operator-pull path.
        euint256 total = Nox.add(aYes, aNo);
        Nox.allowThis(total);
        Nox.allowTransient(total, address(cUSD));
        cUSD.confidentialTransferFrom(u, address(this), total);

        // Encrypted epoch total, used for the all-or-nothing unwrap at execute time.
        e.total = Nox.add(e.total, total);
        Nox.allowThis(e.total);

        if (!committed[currentEpoch][u]) {
            committed[currentEpoch][u] = true;
            e.participantCount += 1;
        }
        emit BetCommitted(currentEpoch, u, e.participantCount);
    }

    /**
     * @notice Close the commit window and make ONLY the two aggregates publicly decryptable.
     * @dev Reverts below k-anonymity (unless `force`) so sub-k epochs never leak near-individual
     *      sums — the honesty limitation made an on-chain invariant. `force` exists solely to stage
     *      the deliberately-bad epoch-#0 exhibit (k=1) for the demo, and emits under the same event.
     */
    function closeEpoch(bool force) external {
        Epoch storage e = _epochs[currentEpoch];
        if (e.state != State.OPEN) revert WrongState(State.OPEN, e.state);
        if (block.timestamp < e.commitDeadline) revert CommitWindowOpen();
        if (!force && e.participantCount < K_MIN) {
            revert KAnonymityNotMet(e.participantCount, K_MIN);
        }
        e.state = State.AWAITING_DECRYPT;
        Nox.allowPublicDecryption(e.sumYes);
        Nox.allowPublicDecryption(e.sumNo);
        emit EpochClosed(currentEpoch, e.participantCount);
        emit AggregatesRevealed(currentEpoch, e.sumYes, e.sumNo);
    }

    /**
     * @notice Burn the pool's OWN pooled cUSD for the epoch total (all-or-nothing). Anyone-can-poke.
     * @dev Uses the internal-handle `unwrap(euint256)` overload (strictly better than passing a
     *      keeper-re-encrypted external handle: no owner/app-binding gymnastics, and the burn is
     *      bounded by the pool's real balance). The returned handle is publicly decryptable — the
     *      keeper reads it off-chain to produce the `finalizeEpoch` proof.
     */
    function executeEpoch() external {
        Epoch storage e = _epochs[currentEpoch];
        if (e.state != State.AWAITING_DECRYPT) revert WrongState(State.AWAITING_DECRYPT, e.state);
        Nox.allowThis(e.total);
        // The wrapper's internal _burn calls NoxCompute AS the cUSD contract, so cUSD needs transient
        // access to the burn-amount handle — same operator-pull ACL pattern as commitBet/claim.
        Nox.allowTransient(e.total, address(cUSD));
        euint256 reqId = cUSD.unwrap(address(this), address(this), e.total);
        e.unwrapId = reqId;
        e.state = State.AWAITING_UNWRAP;
        emit UnwrapRequested(currentEpoch, reqId);
    }

    /**
     * @notice Finalize the unwrap with the decryption proof and route the plaintext aggregates into
     *         the REAL FPMM in one batch. `plainYes`/`plainNo` are the publicly-decrypted aggregates;
     *         the pool checks they sum to exactly the finalized (truly-burnt) amount — the hard
     *         on-chain spend bound. `minYes`/`minNo` are FPMM slippage guards.
     */
    function finalizeEpoch(
        bytes calldata unwrapProof,
        uint256 plainYes,
        uint256 plainNo,
        uint256 minYes,
        uint256 minNo
    ) external {
        Epoch storage e = _epochs[currentEpoch];
        if (e.state != State.AWAITING_UNWRAP) revert WrongState(State.AWAITING_UNWRAP, e.state);

        uint256 balBefore = collateral.balanceOf(address(this));
        cUSD.finalizeUnwrap(e.unwrapId, unwrapProof);
        uint256 released = collateral.balanceOf(address(this)) - balBefore;
        // The FPMM spend can never exceed the truly-unwrapped amount.
        require(plainYes + plainNo == released, "aggregate != unwrapped");

        uint256 before;
        if (plainYes > 0) {
            collateral.approve(address(fpmm), plainYes);
            before = ctf.balanceOf(address(this), _positionId(YES_INDEX_SET));
            fpmm.buy(plainYes, YES_INDEX, minYes);
            e.boughtYes = ctf.balanceOf(address(this), _positionId(YES_INDEX_SET)) - before;
        }
        if (plainNo > 0) {
            collateral.approve(address(fpmm), plainNo);
            before = ctf.balanceOf(address(this), _positionId(NO_INDEX_SET));
            fpmm.buy(plainNo, NO_INDEX, minNo);
            e.boughtNo = ctf.balanceOf(address(this), _positionId(NO_INDEX_SET)) - before;
        }

        e.plainYes = plainYes;
        e.plainNo = plainNo;
        e.state = State.EXECUTED;
        executedEpochs.push(currentEpoch);
        emit EpochExecuted(currentEpoch, plainYes, plainNo, e.boughtYes, e.boughtNo);
    }

    // ================================================================ Settlement

    /**
     * @notice After the oracle resolves the CTF condition, redeem ALL pool outcome tokens to a USDC
     *         pot and fix the PUBLIC payout rate (pot / winning-pool). Wraps the pot back to cUSD so
     *         claims pay out sealed. Callable once, anyone-can-poke.
     */
    function settle() external {
        if (marketSettled) revert AlreadyResolved();
        if (ctf.payoutDenominator(conditionId) == 0) revert NotResolved();
        if (executedEpochs.length == 0) revert NothingToSettle();

        winner = ctf.payoutNumerators(conditionId, YES_INDEX) > 0 ? 0 : 1;

        uint256 potBefore = collateral.balanceOf(address(this));
        uint256[] memory indexSets = new uint256[](2);
        indexSets[0] = YES_INDEX_SET;
        indexSets[1] = NO_INDEX_SET;
        ctf.redeemPositions(collateral, bytes32(0), conditionId, indexSets);
        uint256 pot = collateral.balanceOf(address(this)) - potBefore;

        uint256 winningPool;
        for (uint256 i = 0; i < executedEpochs.length; i++) {
            Epoch storage e = _epochs[executedEpochs[i]];
            winningPool += winner == 0 ? e.plainYes : e.plainNo;
            e.state = State.SETTLED;
        }

        poolRateNum = pot;
        poolRateDen = winningPool;
        marketSettled = true;

        // Wrap the pot so winners are paid in confidential cUSD.
        if (pot > 0) {
            collateral.approve(address(cUSD), pot);
            cUSD.wrap(address(this), pot);
        }
        emit MarketSettled(winner, pot, winningPool);
    }

    /**
     * @notice Claim a sealed payout for an executed+settled epoch. `payout = stakeWin * rateNum /
     *         rateDen` computed as encrypted × public scalar (trivial-encrypted rate, then `mul`
     *         then `div`) — the winning stake stays encrypted end to end and the payout lands as
     *         confidential cUSD. Direction and size stay hidden through and after settlement.
     */
    function claim(uint256 epochId) external {
        if (!marketSettled) revert NotResolved();
        if (claimed[epochId][msg.sender]) revert AlreadyClaimed();
        claimed[epochId][msg.sender] = true;

        euint256 stakeWin = winner == 0 ? _stakeYes[epochId][msg.sender] : _stakeNo[epochId][msg.sender];
        euint256 payout = _scaleByRate(stakeWin, poolRateNum, poolRateDen);

        Nox.allowThis(payout);
        Nox.allowTransient(payout, address(cUSD));
        cUSD.confidentialTransfer(msg.sender, payout);
        Nox.addViewer(payout, msg.sender);
        emit Claimed(epochId, msg.sender);
    }

    /**
     * @notice Escape hatch: if the keeper/market stalls before execution (pool still holds all
     *         cUSD), the commit window's stakers reclaim their full contribution as sealed cUSD
     *         (rate = 1). Same encrypted machinery as `claim`, so one suite covers both rates.
     */
    function refundEpoch(uint256 epochId) external {
        Epoch storage e = _epochs[epochId];
        // Only when funds never left custody (pre-execution) — post-execution they are in the market.
        if (e.state == State.EXECUTED || e.state == State.SETTLED) revert WrongState(State.OPEN, e.state);
        if (block.timestamp < e.commitDeadline) revert CommitWindowOpen();
        if (claimed[epochId][msg.sender]) revert AlreadyClaimed();
        claimed[epochId][msg.sender] = true;
        if (e.state != State.REFUNDING) e.state = State.REFUNDING;

        euint256 back = Nox.add(_stakeYes[epochId][msg.sender], _stakeNo[epochId][msg.sender]);
        Nox.allowThis(back);
        Nox.allowTransient(back, address(cUSD));
        cUSD.confidentialTransfer(msg.sender, back);
        Nox.addViewer(back, msg.sender);
        emit Refunded(epochId, msg.sender);
    }

    // ================================================= k-anonymity (encrypted le)

    /**
     * @notice Capability demo of the on-chain k-gate as an ENCRYPTED comparison: trivially-encrypts
     *         the participant count and `K_MIN`, computes `le(K_MIN, count)`, and makes the boolean
     *         publicly decryptable. Enforcement uses the plaintext count (participation is public
     *         anyway); this exercises `Nox.le` + `allowPublicDecryption(ebool)`. Returns the ebool.
     */
    function kAnonymitySatisfied(uint256 epochId) external returns (ebool ok) {
        uint32 count = _epochs[epochId].participantCount;
        euint256 encCount = Nox.toEuint256(count);
        euint256 encKMin = Nox.toEuint256(K_MIN);
        ok = Nox.le(encKMin, encCount);
        Nox.allowThis(ok);
        Nox.allowPublicDecryption(ok);
    }

    // ==================================================================== Views

    function epochState(uint256 epochId) external view returns (State) {
        return _epochs[epochId].state;
    }

    function epochInfo(uint256 epochId)
        external
        view
        returns (
            State state,
            uint64 commitDeadline,
            uint32 participantCount,
            uint256 plainYes,
            uint256 plainNo,
            uint256 boughtYes,
            uint256 boughtNo
        )
    {
        Epoch storage e = _epochs[epochId];
        return (e.state, e.commitDeadline, e.participantCount, e.plainYes, e.plainNo, e.boughtYes, e.boughtNo);
    }

    function sumHandles(uint256 epochId) external view returns (euint256 sumYes, euint256 sumNo) {
        Epoch storage e = _epochs[epochId];
        return (e.sumYes, e.sumNo);
    }

    function unwrapId(uint256 epochId) external view returns (euint256) {
        return _epochs[epochId].unwrapId;
    }

    /// @notice The caller's own encrypted stakes (viewer-gated: only they can decrypt).
    function myStakes(uint256 epochId, address who) external view returns (euint256 yes, euint256 no) {
        return (_stakeYes[epochId][who], _stakeNo[epochId][who]);
    }

    /// @notice Running confidential cross-epoch exposure (viewer-gated to `who`).
    function netExposure(address who) external view returns (euint256 yes, euint256 no) {
        return (_netYes[who], _netNo[who]);
    }

    function executedEpochCount() external view returns (uint256) {
        return executedEpochs.length;
    }

    // =============================================================== Internals

    function _positionId(uint256 indexSet) internal view returns (uint256) {
        bytes32 collectionId = ctf.getCollectionId(bytes32(0), conditionId, indexSet);
        return ctf.getPositionId(collateral, collectionId);
    }

    /// @dev payout = amount * num / den, as encrypted × public scalar (num,den trivially encrypted).
    function _scaleByRate(euint256 amount, uint256 num, uint256 den) internal returns (euint256) {
        euint256 scaled = Nox.mul(amount, Nox.toEuint256(num));
        return Nox.div(scaled, Nox.toEuint256(den));
    }

    // =========================================================== ERC-1155 sink

    /// @notice Receive outcome tokens from `fpmm.buy` (CTF ERC-1155 safe-transfers to the buyer).
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xf23a6e61; // IERC1155Receiver.onERC1155Received.selector
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xbc197c81; // IERC1155Receiver.onERC1155BatchReceived.selector
    }
}
