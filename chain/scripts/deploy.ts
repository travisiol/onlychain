import { ethers } from "hardhat";

/**
 * Deploy the hub on Robinhood Chain against the real $ONLY:
 *
 *   ONLY_TOKEN=0x… FEE_RECIPIENT=0x… FEE_BPS=1000 DEPLOYER_KEY=0x… npm run deploy
 *
 * FEE_RECIPIENT = a treasury, or 0x000000000000000000000000000000000000dEaD to
 * burn the platform share. Both are immutable afterwards — there is no owner.
 */
async function main() {
  const token = process.env.ONLY_TOKEN;
  const feeRecipient = process.env.FEE_RECIPIENT;
  const feeBps = Number(process.env.FEE_BPS ?? 1000);
  if (!token || !ethers.isAddress(token)) throw new Error("ONLY_TOKEN missing");
  if (!feeRecipient || !ethers.isAddress(feeRecipient)) throw new Error("FEE_RECIPIENT missing");
  const [deployer] = await ethers.getSigners();
  console.log(`deploying OnlyChain(token=${token}, feeRecipient=${feeRecipient}, feeBps=${feeBps}) from ${deployer.address}`);
  const hub = await (await ethers.getContractFactory("OnlyChain")).deploy(token, feeRecipient, feeBps);
  await hub.waitForDeployment();
  console.log(`OnlyChain deployed at ${await hub.getAddress()}`);
  console.log(`→ NEXT_PUBLIC_ONLYCHAIN_HUB=${await hub.getAddress()}`);
  console.log(`→ NEXT_PUBLIC_ONLYCHAIN_TOKEN=${token}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
