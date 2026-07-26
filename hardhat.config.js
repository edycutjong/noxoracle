require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("dotenv").config();

const PK = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = PK ? [PK.startsWith("0x") ? PK : "0x" + PK] : [];

/**
 * Solidity 0.8.35 (matches the Nox library pragma ^0.8.35) for our own contracts.
 * The unmodified Gnosis CTF (1.0.3) + FPMM (1.8.1) are NOT compiled here — they are
 * deployed byte-for-byte from their published npm build artifacts (Solidity 0.5.x) and
 * their on-chain bytecode is hash-checked against the package in scripts/check_artifacts.mjs.
 *
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.35",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts,
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: { enabled: false },
};
