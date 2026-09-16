// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {MockONLY} from "./MockONLY.sol";

/// @notice A stand-in for the Pons V2 bonding curve $ONLY launches on, with
///         the slice of its interface the site uses: `buy` with native ETH,
///         `sell` back to ETH (needs an allowance on the token), the reserves,
///         the real ETH held, `feeBps`, `graduated`. Same constant-product
///         maths as the real curve (fee taken on the way in for buys, on the
///         way out for sells), so the site's quotes can be checked against it.
///         Local node and tests only.
contract MockCurve {
    MockONLY public immutable token;
    uint256 public quoteReserve; // includes the phantom quote, as on Pons
    uint256 public tokenReserve;
    uint16 public constant FEE_BPS = 100;
    bool public graduated;

    event CurveBuy(address indexed sender, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 snipeTax);
    event CurveSell(address indexed sender, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 snipeTax);

    error NativeValueMismatch(uint256 value, uint256 amount);
    error ZeroAmount();
    error Slippage(uint256 out, uint256 minOut);
    error NotEnoughQuote(uint256 wanted, uint256 held);

    constructor(MockONLY token_, uint256 phantomQuote, uint256 launchSupply) {
        token = token_;
        quoteReserve = phantomQuote;
        tokenReserve = launchSupply;
    }

    function feeBps() external pure returns (uint16) {
        return FEE_BPS;
    }

    function getReserves() external view returns (uint256, uint256) {
        return (quoteReserve, tokenReserve);
    }

    /// @notice The ETH actually held — what sells can pay out (the phantom quote is not spendable).
    function realQuoteReserve() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Buy tokens with `quoteAmount` of native ETH (must equal msg.value), sent to `recipient`.
    function buy(uint256 quoteAmount, uint256 minTokensOut, address recipient) external payable returns (uint256 tokensOut) {
        if (msg.value != quoteAmount) revert NativeValueMismatch(msg.value, quoteAmount);
        if (quoteAmount == 0) revert ZeroAmount();
        uint256 fee = (quoteAmount * FEE_BPS) / 10_000;
        uint256 net = quoteAmount - fee;
        tokensOut = (tokenReserve * net) / (quoteReserve + net);
        if (tokensOut < minTokensOut) revert Slippage(tokensOut, minTokensOut);
        quoteReserve += net;
        tokenReserve -= tokensOut;
        token.mint(recipient, tokensOut);
        emit CurveBuy(msg.sender, recipient, quoteAmount, tokensOut, fee, 0);
    }

    /// @notice Sell `tokensIn` (approved to this contract) for native ETH, sent to `recipient`.
    function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) external returns (uint256 quoteOut) {
        if (tokensIn == 0) revert ZeroAmount();
        uint256 gross = (quoteReserve * tokensIn) / (tokenReserve + tokensIn);
        uint256 fee = (gross * FEE_BPS) / 10_000;
        quoteOut = gross - fee;
        if (quoteOut < minQuoteOut) revert Slippage(quoteOut, minQuoteOut);
        if (quoteOut > address(this).balance) revert NotEnoughQuote(quoteOut, address(this).balance);
        token.transferFrom(msg.sender, address(this), tokensIn);
        quoteReserve -= gross;
        tokenReserve += tokensIn;
        (bool ok, ) = recipient.call{value: quoteOut}("");
        require(ok, "send failed");
        emit CurveSell(msg.sender, recipient, tokensIn, quoteOut, fee, 0);
    }
}
