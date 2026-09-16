/** `hardhat node` on 8766 (a port no sibling project uses). Plain hardhat, nothing else. */
import { spawn } from "node:child_process";

const port = process.env.HARDHAT_PORT ?? "8766";
const child = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["hardhat", "node", "--port", port], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
child.on("exit", (code) => process.exit(code ?? 0));
