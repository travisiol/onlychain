import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import multicall3 from "./lib/multicall3.json";
import personas from "../../src/lib/seed/personas.json";

/**
 * Make the local node look like a chain with OnlyChain on it:
 *
 *   npm run node     (in another terminal — hardhat node on 8766)
 *   npm run seed
 *
 * Idempotent. Puts Multicall3 at its canonical address (wagmi batches
 * reads through it), deploys the mock $ONLY (deployer nonce 0), the hub
 * (nonce 1) and a mock Pons curve to buy $ONLY with ETH (nonce 2) so the
 * addresses match .env.example on a fresh node, mints
 * 100 000 ONLY to every default account, sets the sample creators' plans to
 * the prices in personas.json, and has three sample fans subscribe and tip
 * so the studio and the notifications have something to show.
 *
 * Account #15 (0xcd3B…ce71) is left untouched: balance, no allowance, no
 * subscriptions — the wallet the browser tests use, so every flow starts
 * from zero. Addresses are written to chain/local.json.
 */

const FEE_BPS = 1000;
const MINT = ethers.parseEther("100000");

async function main() {
  const signers = await ethers.getSigners();
  const [deployer] = signers;
  const net = await ethers.provider.getNetwork();
  console.log(`ONLYCHAIN — seeding chain ${net.chainId} as ${deployer.address}`);

  for (const c of personas.creators) {
    if (signers[c.account].address.toLowerCase() !== c.address.toLowerCase()) {
      throw new Error(`personas.json expects account #${c.account} = ${c.address}, node has ${signers[c.account].address}. Not Hardhat's default mnemonic?`);
    }
  }

  if ((await ethers.provider.getCode(multicall3.address)) === "0x") {
    await ethers.provider.send("hardhat_setCode", [multicall3.address, multicall3.code]);
    console.log("  multicall3 set");
  }

  // deploy (or reuse) at the deterministic first-two-nonces addresses
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  const expectedToken = ethers.getCreateAddress({ from: deployer.address, nonce: 0 });
  const expectedHub = ethers.getCreateAddress({ from: deployer.address, nonce: 1 });
  const expectedCurve = ethers.getCreateAddress({ from: deployer.address, nonce: 2 });
  let tokenAddress = expectedToken;
  let hubAddress = expectedHub;
  let curveAddress = expectedCurve;
  if (nonce === 0) {
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    await token.waitForDeployment();
    const hub = await (await ethers.getContractFactory("OnlyChain")).deploy(await token.getAddress(), deployer.address, FEE_BPS);
    await hub.waitForDeployment();
    // a fresh Pons-shaped curve: 1.68 ETH of phantom quote against 1e9 tokens, like a real launch
    const curve = await (await ethers.getContractFactory("MockCurve")).deploy(await token.getAddress(), ethers.parseEther("1.68"), ethers.parseEther("1000000000"));
    await curve.waitForDeployment();
    tokenAddress = await token.getAddress();
    hubAddress = await hub.getAddress();
    curveAddress = await curve.getAddress();
    console.log(`  MockONLY  ${tokenAddress}`);
    console.log(`  OnlyChain ${hubAddress} (fee ${FEE_BPS / 100}% → treasury ${deployer.address})`);
    console.log(`  MockCurve ${curveAddress} (buy ONLY with ETH)`);
  } else if ((await ethers.provider.getCode(expectedHub)) !== "0x") {
    console.log(`  reusing token ${tokenAddress}, hub ${hubAddress} and curve ${curveAddress}`);
  } else {
    throw new Error("deployer nonce is not 0 and no hub at the expected address — restart the node for a clean seed");
  }

  const token = await ethers.getContractAt("MockONLY", tokenAddress);
  const hub = await ethers.getContractAt("OnlyChain", hubAddress);
  const curve = await ethers.getContractAt("MockCurve", curveAddress);

  // the deployer buys 2 ETH of ONLY so the curve holds real ETH and sells can pay out (as after a real launch)
  if ((await ethers.provider.getBalance(curveAddress)) === 0n) {
    await (await curve.buy(ethers.parseEther("2"), 0, deployer.address, { value: ethers.parseEther("2") })).wait();
    console.log("  curve primed with 2 ETH");
  }

  // money for everyone
  for (const s of signers) {
    if ((await token.balanceOf(s.address)) < MINT / 2n) await (await token.mint(s.address, MINT)).wait();
  }
  console.log(`  minted ${ethers.formatEther(MINT)} ONLY to ${signers.length} accounts`);

  // plans
  for (const c of personas.creators) {
    const signer = signers[c.account];
    const price = ethers.parseEther(c.monthlyPrice);
    const current = await hub.plans(signer.address);
    if (current.monthlyPrice !== price || !current.open || Number(current.trialDays) !== c.trialDays) {
      await (await hub.connect(signer).setPlan(price, true, c.discount3Bps, c.discount6Bps, c.discount12Bps, c.trialDays)).wait();
    }
  }
  console.log(`  ${personas.creators.length} plans set`);

  // three fans subscribe and tip (fan #14 "nina" and the browser wallet #15 stay clean)
  const fans = personas.fans.slice(0, 3).map((f) => signers[f.account]);
  const subs: [number, number, number][] = [
    // [fan index, creator account, months]
    [0, 1, 3],
    [0, 3, 1],
    [0, 8, 12],
    [1, 2, 1],
    [1, 6, 2],
    [1, 1, 1],
    [2, 5, 6],
    [2, 9, 1],
    [2, 10, 1],
  ];
  let made = 0;
  for (const [fi, account, months] of subs) {
    const fan = fans[fi];
    const creator = signers[account].address;
    if ((await hub.subscribedUntil(creator, fan.address)) > 0n) continue;
    if ((await token.allowance(fan.address, hubAddress)) < MINT) await (await token.connect(fan).approve(hubAddress, ethers.MaxUint256)).wait();
    await (await hub.connect(fan).subscribe(creator, months)).wait();
    made++;
  }
  if (made > 0) {
    await (await hub.connect(fans[0]).tip(signers[1].address, ethers.parseEther("5"), ethers.ZeroHash)).wait();
    await (await hub.connect(fans[1]).tip(signers[2].address, ethers.parseEther("12"), ethers.ZeroHash)).wait();
    await (await hub.connect(fans[2]).tip(signers[5].address, ethers.parseEther("3"), ethers.ZeroHash)).wait();
  }
  console.log(`  ${made} subscriptions made${made ? ", 3 tips" : ""}`);

  const out = {
    chainId: Number(net.chainId),
    token: tokenAddress,
    hub: hubAddress,
    curve: curveAddress,
    feeBps: FEE_BPS,
    feeRecipient: deployer.address,
    browserWallet: signers[15].address,
    updatedAt: new Date().toISOString(),
  };
  const file = process.env.SEED_OUT ? path.resolve(process.env.SEED_OUT) : path.resolve(__dirname, "../local.json");
  fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`  written ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
