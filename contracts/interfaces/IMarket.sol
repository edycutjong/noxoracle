// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {IERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/interfaces/IERC7984.sol";
import {euint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/**
 * @title IConditionalTokens
 * @notice Minimal surface of the UNMODIFIED Gnosis Conditional Tokens Framework (v1.0.3).
 *         The real contract is deployed byte-for-byte from the npm build artifact and
 *         its bytecode is hash-checked in CI (scripts/check_artifacts.mjs). We only declare
 *         the functions NoxOraclePool touches — we never reimplement or modify the protocol.
 */
interface IConditionalTokens {
    function prepareCondition(address oracle, bytes32 questionId, uint256 outcomeSlotCount) external;

    function reportPayouts(bytes32 questionId, uint256[] calldata payouts) external;

    function redeemPositions(
        IERC20 collateralToken,
        bytes32 parentCollectionId,
        bytes32 conditionId,
        uint256[] calldata indexSets
    ) external;

    function getConditionId(address oracle, bytes32 questionId, uint256 outcomeSlotCount)
        external
        pure
        returns (bytes32);

    function getCollectionId(bytes32 parentCollectionId, bytes32 conditionId, uint256 indexSet)
        external
        view
        returns (bytes32);

    function getPositionId(IERC20 collateralToken, bytes32 collectionId)
        external
        pure
        returns (uint256);

    function payoutDenominator(bytes32 conditionId) external view returns (uint256);

    function payoutNumerators(bytes32 conditionId, uint256 index) external view returns (uint256);

    function balanceOf(address owner, uint256 positionId) external view returns (uint256);

    function setApprovalForAll(address operator, bool approved) external;
}

/**
 * @title IFixedProductMarketMaker
 * @notice Minimal surface of the UNMODIFIED Gnosis FixedProductMarketMaker (v1.8.1),
 *         deployed via the official factory and hash-checked. NoxOraclePool only ever
 *         calls `buy` (routing the epoch aggregate into the real market) and reads odds.
 */
interface IFixedProductMarketMaker {
    function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)
        external;

    function calcBuyAmount(uint256 investmentAmount, uint256 outcomeIndex)
        external
        view
        returns (uint256);
}

/**
 * @title IConfidentialUSD
 * @notice The reused ERC-7984 confidential wrapper (cUSD). Extends the standard interface with
 *         the wrap / two-step unwrap surface NoxOraclePool relies on for pooled custody.
 */
interface IConfidentialUSD is IERC7984 {
    function wrap(address to, uint256 amount) external returns (euint256);

    /// @dev Internal-handle unwrap: burns the caller-allowed `amount` handle from `from`,
    ///      marks the (fresh, unique) burn handle publicly decryptable, returns it as the request id.
    function unwrap(address from, address to, euint256 amount) external returns (euint256);

    function finalizeUnwrap(euint256 unwrapRequestId, bytes calldata decryptedAmountAndProof)
        external;

    function underlying() external view returns (address);
}
