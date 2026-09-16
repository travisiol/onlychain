import { HardhatUserConfig, task } from "hardhat/config";
import { TASK_COMPILE } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import { exportAbis } from "./scripts/lib/exportAbi";

/**
 * Every successful `hardhat compile` re-exports the ABIs the site embeds into
 * ../src/lib/abi, so the front end can never drift from the contract.
 * SKIP_ABI_EXPORT=true opts out.
 */
task(TASK_COMPILE, async (args, hre, runSuper) => {
  const result = await runSuper(args);
  if (process.env.SKIP_ABI_EXPORT !== "true") await exportAbis(hre);
  return result;
});

const config: HardhatUserConfig = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    hardhat: { chainId: 31337 },
    // `npm run node` serves this on 8766 (a port no sibling project uses).
    localhost: { url: process.env.HARDHAT_LOCALHOST_URL ?? "http://127.0.0.1:8766", timeout: 120_000 },
    robinhood: {
      url: process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
      chainId: 4663,
      accounts: process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : [],
    },
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
  sourcify: { enabled: false },
  mocha: { timeout: 120_000 },
};

export default config;
