// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from
    "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";

/**
 * @title ConfidentialUSD (cUSD)
 * @notice A 1:1, redeemable confidential wrapper around an unmodified ERC-20 (USDC or DemoUSD).
 *         Balances and transfer amounts are encrypted `euint256` handles processed inside the iExec
 *         Nox TEE. The underlying ERC-20 is held 1:1 and released only against a valid TEE decryption
 *         proof via the two-step unwrap (`unwrap` -> `finalizeUnwrap`).
 * @dev Entire contract is this constructor — wrap / unwrap / finalizeUnwrap / confidentialTransfer /
 *      confidentialTransferFrom / ACL are inherited from the audited Nox library. Vendored unchanged
 *      from NoxSend (disclosed shared skeleton). On the funded run this is the already-deployed
 *      cUSD 0x82C281D7403e44d61968c2F49751a56877468991 — NOT redeployed.
 */
contract ConfidentialUSD is ERC20ToERC7984Wrapper {
    constructor(IERC20 underlying)
        ERC20ToERC7984Wrapper("Confidential USD", "cUSD", "", underlying)
    {}
}
