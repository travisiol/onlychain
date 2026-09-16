// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice A stand-in for the $ONLY coin on the local node and in tests.
///         Anyone can mint; the real coin is whatever the launch produces and
///         is only ever referenced by address.
contract MockONLY is ERC20 {
    constructor() ERC20("OnlyChain", "ONLY") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
