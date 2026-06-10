import "dotenv/config";
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

const config: Parameters<typeof defineConfig>[0] = {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    tests: { nodejs: "test/unit" },
  },
  networks: {
    ...(process.env.MAINNET_RPC_URL && {
      mainnet: {
        type: "http" as const,
        url: configVariable("MAINNET_RPC_URL"),
        chainId: 1,
      },
    }),
    ...(process.env.BASE_RPC_URL && {
      base: {
        type: "http" as const,
        url: configVariable("BASE_RPC_URL"),
        chainId: 8453,
      },
    }),
  },
  ...(process.env.ETHERSCAN_API_KEY && {
    verify: {
      etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
      },
    },
  }),
};

if (process.env.MAINNET_RPC_URL) {
  config.networks!.mainnetFork = {
    type: "edr-simulated",
    forking: {
      url: configVariable("MAINNET_RPC_URL"),
    },
  };
}

if (process.env.BASE_RPC_URL) {
  config.networks!.baseFork = {
    type: "edr-simulated",
    forking: {
      url: configVariable("BASE_RPC_URL"),
    },
  };
}

export default defineConfig(config);
