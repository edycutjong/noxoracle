// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title DemoUSD
 * @notice A plain, UNMODIFIED ERC-20 mirroring USDC's 6 decimals, used as the underlying asset
 *         and the FPMM collateral so judges are never blocked by a dry Circle faucet. Real deployed
 *         ERC-20 — not mock data. Swap for Circle Sepolia USDC in production (wrapper is agnostic).
 * @dev Vendored unchanged from the author's NoxSend entry (disclosed shared skeleton). On the funded
 *      run this is the ALREADY-DEPLOYED 0x486c4B8009ACf0BfE26268512F27200e48BD735C — not redeployed.
 */
contract DemoUSD is ERC20 {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 1_000 * 10 ** 6;

    constructor() ERC20("Demo USD", "dUSD") {
        _mint(msg.sender, 1_000_000 * 10 ** 6);
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Anyone can mint themselves 1,000 dUSD to try NoxOracle.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice Convenience mint used by the deterministic seed script.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
