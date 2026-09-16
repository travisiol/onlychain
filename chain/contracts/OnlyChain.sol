// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title OnlyChain — creator payments in $ONLY, wallet to wallet.
/// @notice Three ways for a fan to pay a creator, all settled in one ERC-20
///         (`token`, the $ONLY coin) and all *pass-through*: the fan's tokens
///         go straight to the creator and to `feeRecipient` in the same
///         transaction. This contract never holds a balance, has no owner,
///         cannot be paused and cannot be upgraded.
///
///         What it records is the part the site cannot fake:
///           - who is subscribed to whom, until when (`subscribedUntil`);
///           - who has paid how much for which piece of content (`unlockedAmount`);
///           - what every creator has earned and every fan has spent.
///
///         A plan carries the things a creator sets on the reference site:
///         the monthly price, bundle discounts for 3 / 6 / 12 months, and a
///         free trial a new fan may start once.
///
///         The content itself (posts, media, messages) lives off-chain on the
///         site, which reads these mappings to decide who sees what.
contract OnlyChain {
    using SafeERC20 for IERC20;

    /// @notice The coin every payment is made in.
    IERC20 public immutable token;
    /// @notice Where the platform share goes — a treasury, or the burn address.
    address public immutable feeRecipient;
    /// @notice Platform share in basis points (1000 = 10 %). Fixed forever.
    uint16 public immutable feeBps;
    /// @notice One subscription month.
    uint32 public constant PERIOD = 30 days;
    /// @notice Hard ceiling on the fee a deployment can set.
    uint16 public constant MAX_FEE_BPS = 2_000;
    /// @notice A bundle can take at most half off; a trial lasts at most a month.
    uint16 public constant MAX_DISCOUNT_BPS = 5_000;
    uint16 public constant MAX_TRIAL_DAYS = 30;

    struct Plan {
        /// Price of one month in `token` units. 0 = a free page.
        uint128 monthlyPrice;
        /// False = not accepting (new or renewed) subscriptions.
        bool open;
        /// Discounts off the total for 3+, 6+ and 12 months, in basis points.
        uint16 discount3Bps;
        uint16 discount6Bps;
        uint16 discount12Bps;
        /// Days of free access a fan who never subscribed may claim once. 0 = none.
        uint16 trialDays;
    }

    /// creator => plan
    mapping(address => Plan) public plans;
    /// creator => fan => unix time the subscription runs until
    mapping(address => mapping(address => uint64)) public subscribedUntil;
    /// creator => fan => the free trial was used
    mapping(address => mapping(address => bool)) public trialUsed;
    /// fan => contentId => total paid for that content
    mapping(address => mapping(bytes32 => uint256)) public unlockedAmount;
    /// creator => net tokens received through this contract
    mapping(address => uint256) public earned;
    /// fan => gross tokens paid through this contract
    mapping(address => uint256) public spent;

    event PlanSet(address indexed creator, uint256 monthlyPrice, bool open, uint16 discount3Bps, uint16 discount6Bps, uint16 discount12Bps, uint16 trialDays);
    /// `months` is 0 for a free trial.
    event Subscribed(address indexed creator, address indexed fan, uint8 months, uint256 paid, uint256 fee, uint64 until);
    event Tipped(address indexed creator, address indexed fan, uint256 amount, uint256 fee, bytes32 indexed ref);
    event Unlocked(address indexed creator, address indexed fan, bytes32 indexed contentId, uint256 paid, uint256 fee);

    error ZeroAddress();
    error FeeTooHigh();
    error BadMonths();
    error BadPlan();
    error PlanClosed();
    error ZeroAmount();
    error SelfPay();
    error TrialUnavailable();

    constructor(IERC20 token_, address feeRecipient_, uint16 feeBps_) {
        if (address(token_) == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        token = token_;
        feeRecipient = feeRecipient_;
        feeBps = feeBps_;
    }

    // ───────────────────────────── creators ─────────────────────────────

    /// @notice Set (or change) your plan. Changing it never touches existing subscriptions.
    function setPlan(uint128 monthlyPrice, bool open, uint16 discount3Bps, uint16 discount6Bps, uint16 discount12Bps, uint16 trialDays) external {
        if (discount3Bps > MAX_DISCOUNT_BPS || discount6Bps > MAX_DISCOUNT_BPS || discount12Bps > MAX_DISCOUNT_BPS || trialDays > MAX_TRIAL_DAYS) revert BadPlan();
        plans[msg.sender] = Plan(monthlyPrice, open, discount3Bps, discount6Bps, discount12Bps, trialDays);
        emit PlanSet(msg.sender, monthlyPrice, open, discount3Bps, discount6Bps, discount12Bps, trialDays);
    }

    // ─────────────────────────────── fans ───────────────────────────────

    /// @notice Subscribe to `creator` for 1–12 months at their current price, bundle discount applied.
    ///         Renewing before the end extends from the current end date.
    function subscribe(address creator, uint8 months) external {
        if (months == 0 || months > 12) revert BadMonths();
        if (creator == msg.sender) revert SelfPay();
        Plan memory plan = plans[creator];
        if (!plan.open) revert PlanClosed();

        (uint256 gross, ) = quoteSubscription(creator, months);
        uint256 fee = _pay(creator, gross);

        uint64 until = _extend(creator, msg.sender, uint64(months) * PERIOD);
        emit Subscribed(creator, msg.sender, months, gross, fee, until);
    }

    /// @notice Start the creator's free trial: once per fan, only for a wallet that never subscribed.
    function startTrial(address creator) external {
        if (creator == msg.sender) revert SelfPay();
        Plan memory plan = plans[creator];
        if (!plan.open) revert PlanClosed();
        if (plan.trialDays == 0 || trialUsed[creator][msg.sender] || subscribedUntil[creator][msg.sender] != 0) revert TrialUnavailable();
        trialUsed[creator][msg.sender] = true;
        uint64 until = _extend(creator, msg.sender, uint64(plan.trialDays) * 1 days);
        emit Subscribed(creator, msg.sender, 0, 0, 0, until);
    }

    /// @notice Tip a creator. `ref` is free-form (a post id, a message id, zero).
    function tip(address creator, uint256 amount, bytes32 ref) external {
        if (amount == 0) revert ZeroAmount();
        if (creator == msg.sender) revert SelfPay();
        uint256 fee = _pay(creator, amount);
        emit Tipped(creator, msg.sender, amount, fee, ref);
    }

    /// @notice Pay for one piece of content (a pay-per-view post or message).
    ///         The site grants access once `unlockedAmount` covers its price.
    function unlock(address creator, bytes32 contentId, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (creator == msg.sender) revert SelfPay();
        uint256 fee = _pay(creator, amount);
        unlockedAmount[msg.sender][contentId] += amount;
        emit Unlocked(creator, msg.sender, contentId, amount, fee);
    }

    // ─────────────────────────────── views ──────────────────────────────

    function isSubscribed(address creator, address fan) external view returns (bool) {
        return subscribedUntil[creator][fan] > block.timestamp;
    }

    /// @notice What a subscription of `months` months to `creator` costs right now (bundle discount applied), and the platform share of it.
    function quoteSubscription(address creator, uint8 months) public view returns (uint256 gross, uint256 fee) {
        Plan memory plan = plans[creator];
        gross = uint256(plan.monthlyPrice) * months;
        uint16 discount = months >= 12 ? plan.discount12Bps : months >= 6 ? plan.discount6Bps : months >= 3 ? plan.discount3Bps : 0;
        gross -= (gross * discount) / 10_000;
        fee = (gross * feeBps) / 10_000;
    }

    /// @notice Whether `fan` may start `creator`'s free trial right now.
    function trialAvailable(address creator, address fan) external view returns (bool) {
        Plan memory plan = plans[creator];
        return plan.open && plan.trialDays > 0 && !trialUsed[creator][fan] && subscribedUntil[creator][fan] == 0 && creator != fan;
    }

    // ────────────────────────────── internal ────────────────────────────

    /// @dev Moves `gross` from the payer: the fee to `feeRecipient`, the rest to the creator. Free (0) is a no-op.
    function _pay(address creator, uint256 gross) internal returns (uint256 fee) {
        if (creator == address(0)) revert ZeroAddress();
        if (gross == 0) return 0;
        fee = (gross * feeBps) / 10_000;
        uint256 net = gross - fee;
        if (fee > 0) token.safeTransferFrom(msg.sender, feeRecipient, fee);
        token.safeTransferFrom(msg.sender, creator, net);
        earned[creator] += net;
        spent[msg.sender] += gross;
    }

    /// @dev Extends from the current end when still active, from now otherwise.
    function _extend(address creator, address fan, uint64 by) internal returns (uint64 until) {
        uint64 current = subscribedUntil[creator][fan];
        uint64 nowTs = uint64(block.timestamp);
        uint64 start = current > nowTs ? current : nowTs;
        until = start + by;
        subscribedUntil[creator][fan] = until;
    }
}
