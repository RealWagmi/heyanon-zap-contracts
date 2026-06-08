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
  networks: {},
};

if (process.env.MAINNET_RPC_URL) {
  config.networks!.mainnetFork = {
    type: "edr-simulated",
    forking: {
      url: configVariable("MAINNET_RPC_URL"),
    },
  };
}

export default defineConfig(config);
