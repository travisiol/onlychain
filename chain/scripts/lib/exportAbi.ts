import * as fs from "fs";
import * as path from "path";
import type { HardhatRuntimeEnvironment } from "hardhat/types";

export const frontendAbiDir = path.resolve(__dirname, "../../../src/lib/abi");

/** Contracts the site embeds. OnlyChain also gets its creation bytecode: /setup deploys it from a wallet. */
const EXPORTED: ReadonlyArray<{ name: string; bytecode: boolean }> = [
  { name: "OnlyChain", bytecode: true },
  { name: "MockONLY", bytecode: false },
  { name: "MockCurve", bytecode: false },
];

export async function exportAbis(hre: HardhatRuntimeEnvironment): Promise<void> {
  fs.mkdirSync(frontendAbiDir, { recursive: true });
  for (const { name, bytecode } of EXPORTED) {
    const artifact = await hre.artifacts.readArtifact(name);
    fs.writeFileSync(path.join(frontendAbiDir, `${name}.abi.json`), JSON.stringify(artifact.abi, null, 2) + "\n");
    if (!bytecode) continue;
    const build = await hre.artifacts.getBuildInfo(`${artifact.sourceName}:${name}`);
    const record = {
      contractName: name,
      sourceName: artifact.sourceName,
      solcVersion: build?.solcVersion ?? null,
      optimizer: build?.input.settings.optimizer ?? null,
      bytecode: artifact.bytecode,
    };
    fs.writeFileSync(path.join(frontendAbiDir, `${name}.bytecode.json`), JSON.stringify(record, null, 2) + "\n");
  }
}
