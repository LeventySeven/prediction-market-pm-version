// Hardhat config (CJS) to avoid ESM/ts-node loader issues in "type": "module" repos.
// This keeps the repo ESM for Next.js, while Hardhat loads reliably.

require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");
require("@typechain/hardhat");

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    amoy: {
      url:
        process.env.ALCHEMY_POLYGON_AMOY_URL ||
        process.env.POLYGON_AMOY_RPC_URL ||
        `https://polygon-amoy.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}` ||
        "https://rpc-amoy.polygon.technology", // Public RPC fallback
      chainId: 80002,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    sepolia: {
      url:
        process.env.ALCHEMY_SEPOLIA_URL ||
        `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      chainId: 11155111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
    mainnet: {
      url:
        process.env.ALCHEMY_MAINNET_URL ||
        `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || ""}`,
      chainId: 1,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      mainnet: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  typechain: {
    outDir: "src/types/contracts",
    target: "ethers-v6",
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

