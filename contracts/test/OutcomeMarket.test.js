const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("OutcomeMarket", function () {
  async function deployFixture() {
    const [owner, alice, bob, carol, feeRecipient] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("OutcomeMarket");
    const market = await factory.deploy(feeRecipient.address);
    const endTime = (await time.latest()) + 7 * 24 * 3600;
    await market.createMarket("BTC above $150K by EOY", endTime, "CRYPTO");
    return { market, owner, alice, bob, carol, feeRecipient, endTime };
  }

  it("creates markets and increments the counter", async function () {
    const { market, owner } = await loadFixture(deployFixture);
    expect(await market.marketCount()).to.equal(1n);

    const endTime = (await time.latest()) + 3600;
    await expect(market.createMarket("Fed cuts in September", endTime, "MACRO"))
      .to.emit(market, "MarketCreated")
      .withArgs(1n, "Fed cuts in September", "MACRO", endTime, owner.address);
    expect(await market.marketCount()).to.equal(2n);
  });

  it("rejects markets that end in the past", async function () {
    const { market } = await loadFixture(deployFixture);
    const past = (await time.latest()) - 10;
    await expect(
      market.createMarket("Time travel", past, "MACRO")
    ).to.be.revertedWith("endTime in past");
  });

  it("accepts YES/NO stakes and tracks pools", async function () {
    const { market, alice, bob } = await loadFixture(deployFixture);

    await market.connect(alice).buyShares(0, true, { value: ethers.parseEther("1") });
    await market.connect(bob).buyShares(0, false, { value: ethers.parseEther("2") });

    const m = await market.getMarket(0);
    expect(m.yesPool).to.equal(ethers.parseEther("1"));
    expect(m.noPool).to.equal(ethers.parseEther("2"));
    expect(await market.yesStakeOf(0, alice.address)).to.equal(ethers.parseEther("1"));
    expect(await market.noStakeOf(0, bob.address)).to.equal(ethers.parseEther("2"));
  });

  it("blocks trading after endTime and resolution before endTime", async function () {
    const { market, alice, endTime } = await loadFixture(deployFixture);

    await expect(market.resolveMarket(0, true)).to.be.revertedWith("market not ended");

    await time.increaseTo(endTime + 1);
    await expect(
      market.connect(alice).buyShares(0, true, { value: 1n })
    ).to.be.revertedWith("trading closed");
  });

  it("only the owner can resolve", async function () {
    const { market, alice, endTime } = await loadFixture(deployFixture);
    await time.increaseTo(endTime + 1);
    await expect(market.connect(alice).resolveMarket(0, true)).to.be.revertedWith(
      "not owner"
    );
  });

  it("pays winners pro-rata minus the 2% fee on the losing pool", async function () {
    const { market, alice, bob, carol, feeRecipient, endTime } =
      await loadFixture(deployFixture);

    // Alice 100 YES, Bob 50 YES, Carol 150 NO (in ether units).
    await market.connect(alice).buyShares(0, true, { value: ethers.parseEther("100") });
    await market.connect(bob).buyShares(0, true, { value: ethers.parseEther("50") });
    await market.connect(carol).buyShares(0, false, { value: ethers.parseEther("150") });

    await time.increaseTo(endTime + 1);

    // Fee = 2% of losing pool (150) = 3, paid to feeRecipient at resolution.
    await expect(market.resolveMarket(0, true)).to.changeEtherBalance(
      feeRecipient,
      ethers.parseEther("3")
    );

    // Net losing pool = 147. Alice: 100 + 100/150*147 = 198. Bob: 50 + 49 = 99.
    await expect(market.connect(alice).claimPayout(0)).to.changeEtherBalance(
      alice,
      ethers.parseEther("198")
    );
    await expect(market.connect(bob).claimPayout(0)).to.changeEtherBalance(
      bob,
      ethers.parseEther("99")
    );

    // Carol lost — nothing to claim; Alice can't double-claim.
    await expect(market.connect(carol).claimPayout(0)).to.be.revertedWith(
      "nothing to claim"
    );
    await expect(market.connect(alice).claimPayout(0)).to.be.revertedWith(
      "already claimed"
    );
  });

  it("refunds everyone when a market is cancelled", async function () {
    const { market, alice, bob } = await loadFixture(deployFixture);

    await market.connect(alice).buyShares(0, true, { value: ethers.parseEther("5") });
    await market.connect(bob).buyShares(0, false, { value: ethers.parseEther("7") });

    await market.cancelMarket(0);

    await expect(market.connect(alice).claimPayout(0)).to.changeEtherBalance(
      alice,
      ethers.parseEther("5")
    );
    await expect(market.connect(bob).claimPayout(0)).to.changeEtherBalance(
      bob,
      ethers.parseEther("7")
    );
  });

  it("auto-cancels one-sided markets so losers get refunds", async function () {
    const { market, carol, endTime } = await loadFixture(deployFixture);

    // Only NO stakes exist; YES wins → nobody backed the winner.
    await market.connect(carol).buyShares(0, false, { value: ethers.parseEther("10") });
    await time.increaseTo(endTime + 1);

    await expect(market.resolveMarket(0, true)).to.emit(market, "MarketCancelled");
    await expect(market.connect(carol).claimPayout(0)).to.changeEtherBalance(
      carol,
      ethers.parseEther("10")
    );
  });
});
