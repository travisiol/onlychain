import { expect } from "chai";
import { ethers } from "hardhat";

const PHANTOM = ethers.parseEther("1.68");
const SUPPLY = ethers.parseEther("1000000000");

/** The site's quote (src/lib/curve.ts) against the curve, to the wei. */
function quoteBuy(q: bigint, t: bigint, feeBps: bigint, quoteIn: bigint) {
  const fee = (quoteIn * feeBps) / 10_000n;
  const net = quoteIn - fee;
  return (t * net) / (q + net);
}

describe("MockCurve (the Pons V2 slice the site uses)", () => {
  it("quotes and sells like the real curve: 0.05 ETH on a fresh curve gives 28 620 988.725… tokens", async () => {
    const [, buyer] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    const curve = await (await ethers.getContractFactory("MockCurve")).deploy(await token.getAddress(), PHANTOM, SUPPLY);
    const [q, t] = await curve.getReserves();
    const expected = quoteBuy(q, t, 100n, ethers.parseEther("0.05"));
    // the figure measured on Robinhood Chain for the same input (memory: pons-v2-robinhood-interface)
    expect(expected).to.equal(28620988725065047701647875n);
    await curve.connect(buyer).buy(ethers.parseEther("0.05"), expected, buyer.address, { value: ethers.parseEther("0.05") });
    expect(await token.balanceOf(buyer.address)).to.equal(expected);
    const [q2, t2] = await curve.getReserves();
    expect(q2).to.equal(q + ethers.parseEther("0.05") - ethers.parseEther("0.0005"));
    expect(t2).to.equal(t - expected);
  });

  it("sells back to ETH with the fee on the way out, from the ETH the curve actually holds", async () => {
    const [, buyer] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    const curve = await (await ethers.getContractFactory("MockCurve")).deploy(await token.getAddress(), PHANTOM, SUPPLY);
    await curve.connect(buyer).buy(ethers.parseEther("0.05"), 0, buyer.address, { value: ethers.parseEther("0.05") });
    const bought = await token.balanceOf(buyer.address);
    const half = bought / 2n;
    const [q, t] = await curve.getReserves();
    const gross = (q * half) / (t + half);
    const expected = gross - (gross * 100n) / 10_000n;
    // the figure measured on Robinhood Chain for the same round trip (memory: pons-v2-robinhood-interface)
    expect(expected).to.equal(24858233611966564n);
    await token.connect(buyer).approve(await curve.getAddress(), half);
    const before = await ethers.provider.getBalance(buyer.address);
    const tx = await curve.connect(buyer).sell(half, expected, buyer.address);
    const receipt = (await tx.wait())!;
    const after = await ethers.provider.getBalance(buyer.address);
    expect(after - before + receipt.gasUsed * receipt.gasPrice).to.equal(expected);
    expect(await token.balanceOf(buyer.address)).to.equal(bought - half);
    expect(await curve.realQuoteReserve()).to.equal(ethers.parseEther("0.05") - expected);
    // selling without an allowance reverts, and the curve never pays more than it holds
    await expect(curve.connect(buyer).sell(half, 0, buyer.address)).to.be.reverted;
  });

  it("refuses a value mismatch and slippage", async () => {
    const [, buyer] = await ethers.getSigners();
    const token = await (await ethers.getContractFactory("MockONLY")).deploy();
    const curve = await (await ethers.getContractFactory("MockCurve")).deploy(await token.getAddress(), PHANTOM, SUPPLY);
    await expect(curve.connect(buyer).buy(ethers.parseEther("1"), 0, buyer.address, { value: ethers.parseEther("0.5") })).to.be.revertedWithCustomError(curve, "NativeValueMismatch");
    await expect(curve.connect(buyer).buy(ethers.parseEther("0.01"), SUPPLY, buyer.address, { value: ethers.parseEther("0.01") })).to.be.revertedWithCustomError(curve, "Slippage");
  });
});
