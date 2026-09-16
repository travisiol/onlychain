/**
 * The OnlyChain hub ABI, written out `as const` so viem/wagmi type every
 * call. tests/abi.test.ts checks it against the JSON Hardhat exports on
 * every compile (src/lib/abi/OnlyChain.abi.json), so the two cannot drift.
 */
export const onlyChainAbi = [
  {"inputs": [{"internalType": "contract IERC20", "name": "token_", "type": "address"}, {"internalType": "address", "name": "feeRecipient_", "type": "address"}, {"internalType": "uint16", "name": "feeBps_", "type": "uint16"}], "stateMutability": "nonpayable", "type": "constructor"},
  {"inputs": [], "name": "BadMonths", "type": "error"},
  {"inputs": [], "name": "BadPlan", "type": "error"},
  {"inputs": [], "name": "FeeTooHigh", "type": "error"},
  {"inputs": [], "name": "PlanClosed", "type": "error"},
  {"inputs": [{"internalType": "address", "name": "token", "type": "address"}], "name": "SafeERC20FailedOperation", "type": "error"},
  {"inputs": [], "name": "SelfPay", "type": "error"},
  {"inputs": [], "name": "TrialUnavailable", "type": "error"},
  {"inputs": [], "name": "ZeroAddress", "type": "error"},
  {"inputs": [], "name": "ZeroAmount", "type": "error"},
  {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "creator", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "monthlyPrice", "type": "uint256"}, {"indexed": false, "internalType": "bool", "name": "open", "type": "bool"}, {"indexed": false, "internalType": "uint16", "name": "discount3Bps", "type": "uint16"}, {"indexed": false, "internalType": "uint16", "name": "discount6Bps", "type": "uint16"}, {"indexed": false, "internalType": "uint16", "name": "discount12Bps", "type": "uint16"}, {"indexed": false, "internalType": "uint16", "name": "trialDays", "type": "uint16"}], "name": "PlanSet", "type": "event"},
  {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "creator", "type": "address"}, {"indexed": true, "internalType": "address", "name": "fan", "type": "address"}, {"indexed": false, "internalType": "uint8", "name": "months", "type": "uint8"}, {"indexed": false, "internalType": "uint256", "name": "paid", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "fee", "type": "uint256"}, {"indexed": false, "internalType": "uint64", "name": "until", "type": "uint64"}], "name": "Subscribed", "type": "event"},
  {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "creator", "type": "address"}, {"indexed": true, "internalType": "address", "name": "fan", "type": "address"}, {"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "fee", "type": "uint256"}, {"indexed": true, "internalType": "bytes32", "name": "ref", "type": "bytes32"}], "name": "Tipped", "type": "event"},
  {"anonymous": false, "inputs": [{"indexed": true, "internalType": "address", "name": "creator", "type": "address"}, {"indexed": true, "internalType": "address", "name": "fan", "type": "address"}, {"indexed": true, "internalType": "bytes32", "name": "contentId", "type": "bytes32"}, {"indexed": false, "internalType": "uint256", "name": "paid", "type": "uint256"}, {"indexed": false, "internalType": "uint256", "name": "fee", "type": "uint256"}], "name": "Unlocked", "type": "event"},
  {"inputs": [], "name": "MAX_DISCOUNT_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "MAX_FEE_BPS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "MAX_TRIAL_DAYS", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "PERIOD", "outputs": [{"internalType": "uint32", "name": "", "type": "uint32"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "earned", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "feeBps", "outputs": [{"internalType": "uint16", "name": "", "type": "uint16"}], "stateMutability": "view", "type": "function"},
  {"inputs": [], "name": "feeRecipient", "outputs": [{"internalType": "address", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "address", "name": "fan", "type": "address"}], "name": "isSubscribed", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "plans", "outputs": [{"internalType": "uint128", "name": "monthlyPrice", "type": "uint128"}, {"internalType": "bool", "name": "open", "type": "bool"}, {"internalType": "uint16", "name": "discount3Bps", "type": "uint16"}, {"internalType": "uint16", "name": "discount6Bps", "type": "uint16"}, {"internalType": "uint16", "name": "discount12Bps", "type": "uint16"}, {"internalType": "uint16", "name": "trialDays", "type": "uint16"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "uint8", "name": "months", "type": "uint8"}], "name": "quoteSubscription", "outputs": [{"internalType": "uint256", "name": "gross", "type": "uint256"}, {"internalType": "uint256", "name": "fee", "type": "uint256"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "uint128", "name": "monthlyPrice", "type": "uint128"}, {"internalType": "bool", "name": "open", "type": "bool"}, {"internalType": "uint16", "name": "discount3Bps", "type": "uint16"}, {"internalType": "uint16", "name": "discount6Bps", "type": "uint16"}, {"internalType": "uint16", "name": "discount12Bps", "type": "uint16"}, {"internalType": "uint16", "name": "trialDays", "type": "uint16"}], "name": "setPlan", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}], "name": "spent", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}], "name": "startTrial", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "uint8", "name": "months", "type": "uint8"}], "name": "subscribe", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}, {"internalType": "address", "name": "", "type": "address"}], "name": "subscribedUntil", "outputs": [{"internalType": "uint64", "name": "", "type": "uint64"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}, {"internalType": "bytes32", "name": "ref", "type": "bytes32"}], "name": "tip", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
  {"inputs": [], "name": "token", "outputs": [{"internalType": "contract IERC20", "name": "", "type": "address"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "address", "name": "fan", "type": "address"}], "name": "trialAvailable", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}, {"internalType": "address", "name": "", "type": "address"}], "name": "trialUsed", "outputs": [{"internalType": "bool", "name": "", "type": "bool"}], "stateMutability": "view", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "creator", "type": "address"}, {"internalType": "bytes32", "name": "contentId", "type": "bytes32"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}], "name": "unlock", "outputs": [], "stateMutability": "nonpayable", "type": "function"},
  {"inputs": [{"internalType": "address", "name": "", "type": "address"}, {"internalType": "bytes32", "name": "", "type": "bytes32"}], "name": "unlockedAmount", "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}], "stateMutability": "view", "type": "function"},
] as const;

/**
 * The slice of the Pons V2 bonding curve the site uses to sell $ONLY for ETH:
 * `buy(quoteAmount == msg.value, minTokensOut, recipient)`, the reserves
 * (phantom quote included) and the fee for the quote, `graduated` to know
 * when to send buyers to the DEX instead. Same on the local MockCurve.
 */
export const curveAbi = [
  { type: "function", name: "buy", inputs: [{ name: "quoteAmount", type: "uint256" }, { name: "minTokensOut", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [{ name: "tokensOut", type: "uint256" }], stateMutability: "payable" },
  { type: "function", name: "sell", inputs: [{ name: "tokensIn", type: "uint256" }, { name: "minQuoteOut", type: "uint256" }, { name: "recipient", type: "address" }], outputs: [{ name: "quoteOut", type: "uint256" }], stateMutability: "nonpayable" },
  { type: "function", name: "getReserves", inputs: [], outputs: [{ name: "", type: "uint256" }, { name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "realQuoteReserve", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "feeBps", inputs: [], outputs: [{ name: "", type: "uint16" }], stateMutability: "view" },
  { type: "function", name: "graduated", inputs: [], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
] as const;

/** The slice of ERC-20 the site uses on $ONLY. */
export const erc20Abi = [
  { type: "function", name: "name", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ name: "", type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ name: "", type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "balanceOf", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "allowance", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ name: "spender", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
  { type: "function", name: "mint", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  {
    type: "event",
    name: "Transfer",
    anonymous: false,
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Approval",
    anonymous: false,
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "spender", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
