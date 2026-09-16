import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const ONE = ethers.parseEther("1");
const PERIOD = 30 * 24 * 3600;
const FEE_BPS = 1000n;

async function deploy() {
  const [deployer, treasury, creator, fan, other] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockONLY")).deploy();
  const hub = await (await ethers.getContractFactory("OnlyChain")).deploy(await token.getAddress(), treasury.address, FEE_BPS);
  await token.mint(fan.address, 10_000n * ONE);
  await token.mint(other.address, 10_000n * ONE);
  await token.connect(fan).approve(await hub.getAddress(), ethers.MaxUint256);
  await token.connect(other).approve(await hub.getAddress(), ethers.MaxUint256);
  return { deployer, treasury, creator, fan, other, token, hub };
}

describe("OnlyChain", () => {
  it("refuses a zero token, a zero fee recipient and a fee above the ceiling", async () => {
    const [, treasury] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    const Hub = await ethers.getContractFactory("OnlyChain");
    await expect(Hub.deploy(ethers.ZeroAddress, treasury.address, 1000)).to.be.revertedWithCustomError(Hub, "ZeroAddress");
    await expect(Hub.deploy(await token.getAddress(), ethers.ZeroAddress, 1000)).to.be.revertedWithCustomError(Hub, "ZeroAddress");
    await expect(Hub.deploy(await token.getAddress(), treasury.address, 2001)).to.be.revertedWithCustomError(Hub, "FeeTooHigh");
  });

  it("has no owner and no way to move tokens except paying a creator", async () => {
    const { hub } = await loadFixture(deploy);
    const names = hub.interface.fragments.filter((f) => f.type === "function").map((f) => (f as { name: string }).name);
    expect(names).to.not.include.members(["owner", "transferOwnership", "pause", "withdraw", "sweep", "rescue", "setFee", "setFeeRecipient"]);
    expect(names.sort()).to.deep.equal(
      ["MAX_DISCOUNT_BPS", "MAX_FEE_BPS", "MAX_TRIAL_DAYS", "PERIOD", "earned", "feeBps", "feeRecipient", "isSubscribed", "plans", "quoteSubscription", "setPlan", "spent", "startTrial", "subscribe", "subscribedUntil", "tip", "token", "trialAvailable", "trialUsed", "unlock", "unlockedAmount"].sort(),
    );
  });

  it("lets a creator set a plan and emits it", async () => {
    const { hub, creator } = await loadFixture(deploy);
    await expect(hub.connect(creator).setPlan(25n * ONE, true, 1000, 2000, 3000, 7))
      .to.emit(hub, "PlanSet")
      .withArgs(creator.address, 25n * ONE, true, 1000, 2000, 3000, 7);
    const plan = await hub.plans(creator.address);
    expect(plan.monthlyPrice).to.equal(25n * ONE);
    expect(plan.open).to.equal(true);
    expect(plan.discount12Bps).to.equal(3000);
    expect(plan.trialDays).to.equal(7);
    await expect(hub.connect(creator).setPlan(25n * ONE, true, 5001, 0, 0, 0)).to.be.revertedWithCustomError(hub, "BadPlan");
    await expect(hub.connect(creator).setPlan(25n * ONE, true, 0, 0, 0, 31)).to.be.revertedWithCustomError(hub, "BadPlan");
  });

  it("bundles: 3, 6 and 12 months take the creator's discount off the total", async () => {
    const { hub, token, creator, fan, treasury } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(10n * ONE, true, 1000, 2000, 5000, 0);
    expect((await hub.quoteSubscription(creator.address, 1))[0]).to.equal(10n * ONE);
    expect((await hub.quoteSubscription(creator.address, 2))[0]).to.equal(20n * ONE);
    expect((await hub.quoteSubscription(creator.address, 3))[0]).to.equal(27n * ONE); // -10 %
    expect((await hub.quoteSubscription(creator.address, 6))[0]).to.equal(48n * ONE); // -20 %
    expect((await hub.quoteSubscription(creator.address, 12))[0]).to.equal(60n * ONE); // -50 %
    await hub.connect(fan).subscribe(creator.address, 12);
    expect(await token.balanceOf(creator.address)).to.equal(54n * ONE);
    expect(await token.balanceOf(treasury.address)).to.equal(6n * ONE);
    expect(await hub.spent(fan.address)).to.equal(60n * ONE);
  });

  it("free trial: once, only for a wallet that never subscribed, records a Subscribed with 0 months", async () => {
    const { hub, token, creator, fan, other } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 7);
    expect(await hub.trialAvailable(creator.address, fan.address)).to.equal(true);
    const before = await token.balanceOf(fan.address);
    const tx = await hub.connect(fan).startTrial(creator.address);
    const at = (await ethers.provider.getBlock((await tx.wait())!.blockNumber))!.timestamp;
    await expect(tx).to.emit(hub, "Subscribed").withArgs(creator.address, fan.address, 0, 0, 0, at + 7 * 24 * 3600);
    expect(await token.balanceOf(fan.address)).to.equal(before);
    expect(await hub.isSubscribed(creator.address, fan.address)).to.equal(true);
    expect(await hub.trialAvailable(creator.address, fan.address)).to.equal(false);
    await expect(hub.connect(fan).startTrial(creator.address)).to.be.revertedWithCustomError(hub, "TrialUnavailable");
    // a paying subscription then extends from the trial's end
    await hub.connect(fan).subscribe(creator.address, 1);
    expect(await hub.subscribedUntil(creator.address, fan.address)).to.equal(at + 7 * 24 * 3600 + PERIOD);
    // someone who subscribed before cannot take the trial
    await hub.connect(other).subscribe(creator.address, 1);
    expect(await hub.trialAvailable(creator.address, other.address)).to.equal(false);
    await expect(hub.connect(other).startTrial(creator.address)).to.be.revertedWithCustomError(hub, "TrialUnavailable");
    // no trial configured
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    const [, , , , , , , newcomer] = await ethers.getSigners();
    await expect(hub.connect(newcomer).startTrial(creator.address)).to.be.revertedWithCustomError(hub, "TrialUnavailable");
  });

  it("subscribes for N months, splits 90/10 straight through and never keeps a balance", async () => {
    const { hub, token, creator, fan, treasury } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(25n * ONE, true, 0, 0, 0, 0);
    const [gross, fee] = await hub.quoteSubscription(creator.address, 3);
    expect(gross).to.equal(75n * ONE);
    expect(fee).to.equal(7_500000000000000000n); // 7.5 ONLY

    const tx = await hub.connect(fan).subscribe(creator.address, 3);
    const at = (await ethers.provider.getBlock((await tx.wait())!.blockNumber))!.timestamp;
    await expect(tx).to.emit(hub, "Subscribed").withArgs(creator.address, fan.address, 3, 75n * ONE, fee, at + 3 * PERIOD);

    expect(await token.balanceOf(creator.address)).to.equal(67_500000000000000000n);
    expect(await token.balanceOf(treasury.address)).to.equal(fee);
    expect(await token.balanceOf(await hub.getAddress())).to.equal(0n);
    expect(await hub.isSubscribed(creator.address, fan.address)).to.equal(true);
    expect(await hub.earned(creator.address)).to.equal(67_500000000000000000n);
    expect(await hub.spent(fan.address)).to.equal(75n * ONE);
  });

  it("renewing before the end extends from the end, and the subscription lapses after", async () => {
    const { hub, creator, fan } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    await hub.connect(fan).subscribe(creator.address, 1);
    const first = await hub.subscribedUntil(creator.address, fan.address);
    await time.increase(10 * 24 * 3600);
    await hub.connect(fan).subscribe(creator.address, 2);
    expect(await hub.subscribedUntil(creator.address, fan.address)).to.equal(first + BigInt(2 * PERIOD));
    await time.increaseTo(first + BigInt(2 * PERIOD) + 1n);
    expect(await hub.isSubscribed(creator.address, fan.address)).to.equal(false);
    // Coming back after a lapse starts from now, not from the old end.
    const tx = await hub.connect(fan).subscribe(creator.address, 1);
    const at = (await ethers.provider.getBlock((await tx.wait())!.blockNumber))!.timestamp;
    expect(await hub.subscribedUntil(creator.address, fan.address)).to.equal(at + PERIOD);
  });

  it("a free page subscribes without moving a token", async () => {
    const { hub, token, creator, fan } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(0, true, 0, 0, 0, 0);
    const before = await token.balanceOf(fan.address);
    await expect(hub.connect(fan).subscribe(creator.address, 12)).to.emit(hub, "Subscribed");
    expect(await token.balanceOf(fan.address)).to.equal(before);
    expect(await hub.isSubscribed(creator.address, fan.address)).to.equal(true);
  });

  it("refuses closed plans, bad month counts and paying yourself", async () => {
    const { hub, creator, fan } = await loadFixture(deploy);
    await expect(hub.connect(fan).subscribe(creator.address, 1)).to.be.revertedWithCustomError(hub, "PlanClosed");
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    await expect(hub.connect(fan).subscribe(creator.address, 0)).to.be.revertedWithCustomError(hub, "BadMonths");
    await expect(hub.connect(fan).subscribe(creator.address, 13)).to.be.revertedWithCustomError(hub, "BadMonths");
    await expect(hub.connect(creator).subscribe(creator.address, 1)).to.be.revertedWithCustomError(hub, "SelfPay");
    await hub.connect(creator).setPlan(10n * ONE, false, 0, 0, 0, 0);
    await expect(hub.connect(fan).subscribe(creator.address, 1)).to.be.revertedWithCustomError(hub, "PlanClosed");
  });

  it("closing a plan does not cut an existing subscription short", async () => {
    const { hub, creator, fan } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    await hub.connect(fan).subscribe(creator.address, 1);
    await hub.connect(creator).setPlan(10n * ONE, false, 0, 0, 0, 0);
    expect(await hub.isSubscribed(creator.address, fan.address)).to.equal(true);
  });

  it("tips go through with the same split and a reference", async () => {
    const { hub, token, creator, fan, treasury } = await loadFixture(deploy);
    const ref = ethers.keccak256(ethers.toUtf8Bytes("post:abc"));
    await expect(hub.connect(fan).tip(creator.address, 5n * ONE, ref))
      .to.emit(hub, "Tipped")
      .withArgs(creator.address, fan.address, 5n * ONE, ethers.parseEther("0.5"), ref);
    expect(await token.balanceOf(creator.address)).to.equal(ethers.parseEther("4.5"));
    expect(await token.balanceOf(treasury.address)).to.equal(ethers.parseEther("0.5"));
    await expect(hub.connect(fan).tip(creator.address, 0, ref)).to.be.revertedWithCustomError(hub, "ZeroAmount");
    await expect(hub.connect(creator).tip(creator.address, ONE, ref)).to.be.revertedWithCustomError(hub, "SelfPay");
  });

  it("unlocks accumulate per fan and per content", async () => {
    const { hub, creator, fan, other } = await loadFixture(deploy);
    const content = ethers.keccak256(ethers.toUtf8Bytes("post:ppv-1"));
    await expect(hub.connect(fan).unlock(creator.address, content, 20n * ONE))
      .to.emit(hub, "Unlocked")
      .withArgs(creator.address, fan.address, content, 20n * ONE, 2n * ONE);
    await hub.connect(fan).unlock(creator.address, content, 5n * ONE);
    expect(await hub.unlockedAmount(fan.address, content)).to.equal(25n * ONE);
    expect(await hub.unlockedAmount(other.address, content)).to.equal(0n);
    expect(await hub.earned(creator.address)).to.equal(ethers.parseEther("22.5"));
  });

  it("fails cleanly without an allowance or a balance", async () => {
    const { hub, token, creator, deployer } = await loadFixture(deploy);
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    // deployer has an allowance of zero and no tokens
    await expect(hub.connect(deployer).subscribe(creator.address, 1)).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    await token.connect(deployer).approve(await hub.getAddress(), ethers.MaxUint256);
    await expect(hub.connect(deployer).subscribe(creator.address, 1)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
  });

  it("a zero fee deployment sends everything to the creator", async () => {
    const [, treasury, creator, fan] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    const hub = await (await ethers.getContractFactory("OnlyChain")).deploy(await token.getAddress(), treasury.address, 0);
    await token.mint(fan.address, 100n * ONE);
    await token.connect(fan).approve(await hub.getAddress(), ethers.MaxUint256);
    await hub.connect(creator).setPlan(10n * ONE, true, 0, 0, 0, 0);
    await hub.connect(fan).subscribe(creator.address, 1);
    expect(await token.balanceOf(creator.address)).to.equal(10n * ONE);
    expect(await token.balanceOf(treasury.address)).to.equal(0n);
  });
});
