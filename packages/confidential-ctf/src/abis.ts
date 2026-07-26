// Minimal human-readable ABIs. Encrypted types (euint256 / externalEuint256 / ebool) are bytes32
// on the wire; external inputs are (bytes32 handle, bytes proof).

export const NOX_ORACLE_POOL_ABI = [
  // config / market
  'function K_MIN() view returns (uint32)',
  'function YES_INDEX() view returns (uint256)',
  'function NO_INDEX() view returns (uint256)',
  'function cUSD() view returns (address)',
  'function collateral() view returns (address)',
  'function ctf() view returns (address)',
  'function fpmm() view returns (address)',
  'function conditionId() view returns (bytes32)',
  'function questionId() view returns (bytes32)',
  'function oracle() view returns (address)',
  'function currentEpoch() view returns (uint256)',
  // lifecycle
  'function openEpoch(uint64 commitWindowSeconds) returns (uint256)',
  'function commitBet(bytes32 hYes, bytes pYes, bytes32 hNo, bytes pNo)',
  'function closeEpoch(bool force)',
  'function executeEpoch()',
  'function finalizeEpoch(bytes unwrapProof, uint256 plainYes, uint256 plainNo, uint256 minYes, uint256 minNo)',
  'function settle()',
  'function claim(uint256 epochId)',
  'function refundEpoch(uint256 epochId)',
  'function kAnonymitySatisfied(uint256 epochId) returns (bytes32)',
  // views
  'function epochState(uint256 epochId) view returns (uint8)',
  'function epochInfo(uint256 epochId) view returns (uint8 state, uint64 commitDeadline, uint32 participantCount, uint256 plainYes, uint256 plainNo, uint256 boughtYes, uint256 boughtNo)',
  'function sumHandles(uint256 epochId) view returns (bytes32 sumYes, bytes32 sumNo)',
  'function unwrapId(uint256 epochId) view returns (bytes32)',
  'function myStakes(uint256 epochId, address who) view returns (bytes32 yes, bytes32 no)',
  'function netExposure(address who) view returns (bytes32 yes, bytes32 no)',
  'function committed(uint256 epochId, address who) view returns (bool)',
  'function claimed(uint256 epochId, address who) view returns (bool)',
  'function executedEpochCount() view returns (uint256)',
  'function marketSettled() view returns (bool)',
  'function winner() view returns (uint8)',
  'function poolRateNum() view returns (uint256)',
  'function poolRateDen() view returns (uint256)',
  // events
  'event EpochOpened(uint256 indexed epoch, uint64 commitDeadline)',
  'event BetCommitted(uint256 indexed epoch, address indexed bettor, uint32 participantCount)',
  'event EpochClosed(uint256 indexed epoch, uint32 participantCount)',
  'event AggregatesRevealed(uint256 indexed epoch, bytes32 sumYes, bytes32 sumNo)',
  'event UnwrapRequested(uint256 indexed epoch, bytes32 unwrapId)',
  'event EpochExecuted(uint256 indexed epoch, uint256 plainYes, uint256 plainNo, uint256 boughtYes, uint256 boughtNo)',
  'event MarketSettled(uint8 winner, uint256 pot, uint256 winningPool)',
  'event Claimed(uint256 indexed epoch, address indexed bettor)',
  'event Refunded(uint256 indexed epoch, address indexed bettor)',
] as const;

export const CONFIDENTIAL_USD_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function underlying() view returns (address)',
  'function confidentialBalanceOf(address account) view returns (bytes32)',
  'function confidentialTotalSupply() view returns (bytes32)',
  'function wrap(address to, uint256 amount) returns (bytes32)',
  'function unwrap(address from, address to, bytes32 amount) returns (bytes32)',
  'function unwrap(address from, address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)',
  'function finalizeUnwrap(bytes32 unwrapRequestId, bytes decryptedAmountAndProof)',
  'function confidentialTransfer(address to, bytes32 encryptedAmount, bytes inputProof) returns (bytes32)',
  'function confidentialTransfer(address to, bytes32 amount) returns (bytes32)',
  'function confidentialTransferFrom(address from, address to, bytes32 amount) returns (bytes32)',
  'function setOperator(address operator, uint48 until)',
  'function isOperator(address holder, address spender) view returns (bool)',
  'event UnwrapRequested(address indexed to, bytes32 unwrapAmount)',
  'event UnwrapFinalized(address indexed to, bytes32 indexed unwrapRequestId, uint256 amount)',
] as const;

// Unmodified Gnosis Conditional Tokens (v1.0.3) — the subset NoxOracle reads/writes.
export const CONDITIONAL_TOKENS_ABI = [
  'function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount)',
  'function reportPayouts(bytes32 questionId, uint256[] payouts)',
  'function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount)',
  'function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)',
  'function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount) pure returns (bytes32)',
  'function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet) view returns (bytes32)',
  'function getPositionId(address collateralToken, bytes32 collectionId) pure returns (uint256)',
  'function getOutcomeSlotCount(bytes32 conditionId) view returns (uint256)',
  'function payoutDenominator(bytes32 conditionId) view returns (uint256)',
  'function payoutNumerators(bytes32 conditionId, uint256 index) view returns (uint256)',
  'function balanceOf(address owner, uint256 positionId) view returns (uint256)',
  'function setApprovalForAll(address operator, bool approved)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'event ConditionPreparation(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount)',
  'event ConditionResolution(bytes32 indexed conditionId, address indexed oracle, bytes32 indexed questionId, uint256 outcomeSlotCount, uint256[] payoutNumerators)',
  'event PositionSplit(address indexed stakeholder, address collateralToken, bytes32 indexed parentCollectionId, bytes32 indexed conditionId, uint256[] partition, uint256 amount)',
  'event PayoutRedemption(address indexed redeemer, address indexed collateralToken, bytes32 indexed parentCollectionId, bytes32 conditionId, uint256[] indexSets, uint256 payout)',
] as const;

// Unmodified Gnosis FixedProductMarketMaker (v1.8.1).
export const FPMM_ABI = [
  'function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)',
  'function calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex) view returns (uint256)',
  'function addFunding(uint256 addedFunds, uint256[] distributionHint)',
  'function conditionalTokens() view returns (address)',
  'function collateralToken() view returns (address)',
  'function fee() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'event FPMMBuy(address indexed buyer, uint256 investmentAmount, uint256 feeAmount, uint256 indexed outcomeIndex, uint256 outcomeTokensBought)',
  'event FPMMFundingAdded(address indexed funder, uint256[] amountsAdded, uint256 sharesMinted)',
] as const;

export const FPMM_FACTORY_ABI = [
  'function implementationMaster() view returns (address)',
  'function createFixedProductMarketMaker(address conditionalTokens, address collateralToken, bytes32[] conditionIds, uint256 fee) returns (address)',
  'event FixedProductMarketMakerCreation(address indexed creator, address fixedProductMarketMaker, address indexed conditionalTokens, address indexed collateralToken, bytes32[] conditionIds, uint256 fee)',
] as const;

export const DEMO_USD_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function faucet()',
  'function mint(address to, uint256 amount)',
  'function FAUCET_AMOUNT() view returns (uint256)',
] as const;

// The NoxCompute protocol contract: ACL reads used by the /verify inspector + admin-minimality proof.
export const NOX_PROTOCOL_ABI = [
  'function isViewer(bytes32 handle, address viewer) view returns (bool)',
  'function isAllowed(bytes32 handle, address account) view returns (bool)',
  'function isPubliclyDecryptable(bytes32 handle) view returns (bool)',
  'function addViewer(bytes32 handle, address viewer)',
  'function allow(bytes32 handle, address account)',
  'function allowPublicDecryption(bytes32 handle)',
  'event MarkedAsPubliclyDecryptable(address indexed sender, bytes32 indexed handle)',
] as const;
