// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title OutcomeMarket
 * @notice Parimutuel YES/NO outcome markets settled in native OKB on X Layer EVM.
 *
 *         Anyone can create a market. Users back YES or NO with native OKB while
 *         the market is open. After `endTime`, the resolver settles the outcome:
 *         winners reclaim their stake plus a pro-rata share of the losing pool,
 *         minus a protocol fee skimmed from the losing pool at resolution.
 *
 *         Non-custodial: funds only move via user-signed buyShares / claimPayout
 *         calls. If nobody backed the winning side, the market auto-cancels and
 *         every participant can reclaim their full stake.
 */
contract OutcomeMarket {
    enum Status {
        Open,
        Resolved,
        Cancelled
    }

    struct Market {
        string title;
        string category;
        uint64 endTime;
        Status status;
        bool outcome; // only meaningful when status == Resolved
        uint128 yesPool;
        uint128 noPool;
        address creator;
    }

    uint256 public constant FEE_BPS = 200; // 2% of the losing pool
    uint256 private constant BPS = 10_000;

    address public owner;
    address public feeRecipient;
    uint256 public marketCount;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => uint256)) public yesStakeOf;
    mapping(uint256 => mapping(address => uint256)) public noStakeOf;
    mapping(uint256 => mapping(address => bool)) public claimed;

    uint256 private _lock = 1;

    event MarketCreated(
        uint256 indexed marketId,
        string title,
        string category,
        uint64 endTime,
        address indexed creator
    );
    event SharesBought(
        uint256 indexed marketId,
        address indexed buyer,
        bool isYes,
        uint256 amount
    );
    event MarketResolved(uint256 indexed marketId, bool outcome, uint256 fee);
    event MarketCancelled(uint256 indexed marketId);
    event PayoutClaimed(
        uint256 indexed marketId,
        address indexed user,
        uint256 amount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 1, "reentrancy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address _feeRecipient) {
        require(_feeRecipient != address(0), "zero fee recipient");
        owner = msg.sender;
        feeRecipient = _feeRecipient;
    }

    // ---------------------------------------------------------------- markets

    function createMarket(
        string calldata title,
        uint64 endTime,
        string calldata category
    ) external returns (uint256 marketId) {
        require(bytes(title).length > 0, "empty title");
        require(endTime > block.timestamp, "endTime in past");

        marketId = marketCount++;
        Market storage m = markets[marketId];
        m.title = title;
        m.category = category;
        m.endTime = endTime;
        m.creator = msg.sender;

        emit MarketCreated(marketId, title, category, endTime, msg.sender);
    }

    function buyShares(uint256 marketId, bool isYes) external payable {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "market not open");
        require(block.timestamp < m.endTime, "trading closed");
        require(msg.value > 0, "zero stake");
        require(msg.value <= type(uint128).max, "stake too large");

        if (isYes) {
            m.yesPool += uint128(msg.value);
            yesStakeOf[marketId][msg.sender] += msg.value;
        } else {
            m.noPool += uint128(msg.value);
            noStakeOf[marketId][msg.sender] += msg.value;
        }

        emit SharesBought(marketId, msg.sender, isYes, msg.value);
    }

    // ------------------------------------------------------------- settlement

    function resolveMarket(
        uint256 marketId,
        bool winningOutcome
    ) external onlyOwner nonReentrant {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "already settled");
        require(block.timestamp >= m.endTime, "market not ended");

        uint256 winPool = winningOutcome ? m.yesPool : m.noPool;
        uint256 losePool = winningOutcome ? m.noPool : m.yesPool;

        if (winPool == 0) {
            // One-sided market: nobody backed the winner, refund everyone.
            m.status = Status.Cancelled;
            emit MarketCancelled(marketId);
            return;
        }

        m.status = Status.Resolved;
        m.outcome = winningOutcome;

        uint256 fee = (losePool * FEE_BPS) / BPS;
        if (fee > 0) {
            (bool ok, ) = feeRecipient.call{value: fee}("");
            require(ok, "fee transfer failed");
        }

        emit MarketResolved(marketId, winningOutcome, fee);
    }

    function cancelMarket(uint256 marketId) external onlyOwner {
        Market storage m = _market(marketId);
        require(m.status == Status.Open, "already settled");
        m.status = Status.Cancelled;
        emit MarketCancelled(marketId);
    }

    function claimPayout(uint256 marketId) external nonReentrant {
        Market storage m = _market(marketId);
        require(m.status != Status.Open, "market not settled");
        require(!claimed[marketId][msg.sender], "already claimed");
        claimed[marketId][msg.sender] = true;

        uint256 payout;
        if (m.status == Status.Cancelled) {
            payout =
                yesStakeOf[marketId][msg.sender] +
                noStakeOf[marketId][msg.sender];
        } else {
            uint256 stake = m.outcome
                ? yesStakeOf[marketId][msg.sender]
                : noStakeOf[marketId][msg.sender];
            if (stake > 0) {
                uint256 winPool = m.outcome ? m.yesPool : m.noPool;
                uint256 losePool = m.outcome ? m.noPool : m.yesPool;
                uint256 netLosePool = losePool - (losePool * FEE_BPS) / BPS;
                payout = stake + (stake * netLosePool) / winPool;
            }
        }

        require(payout > 0, "nothing to claim");
        emit PayoutClaimed(marketId, msg.sender, payout);

        (bool ok, ) = msg.sender.call{value: payout}("");
        require(ok, "payout transfer failed");
    }

    // ------------------------------------------------------------------ admin

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "zero fee recipient");
        feeRecipient = _feeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        owner = newOwner;
    }

    // ------------------------------------------------------------------ views

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return _market(marketId);
    }

    function _market(uint256 marketId) internal view returns (Market storage m) {
        require(marketId < marketCount, "unknown market");
        m = markets[marketId];
    }
}
