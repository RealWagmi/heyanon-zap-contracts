// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @notice Mock swap target for testing. Takes tokenIn and gives tokenOut at a fixed rate.
 */
contract MockSwapTarget {
    using SafeERC20 for IERC20;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address recipient
    ) external {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}

/**
 * @notice Mock target that always reverts.
 */
contract MockRevertTarget {
    error AlwaysReverts(string reason);

    function doSomething() external pure {
        revert AlwaysReverts("intentional revert");
    }
}

/**
 * @notice Mock vault that accepts a deposit token and mints shares 1:1.
 */
contract MockVault {
    using SafeERC20 for IERC20;

    address public want;
    mapping(address => uint256) public shares;

    constructor(address _want) {
        want = _want;
    }

    function deposit(uint256 amount) external {
        IERC20(want).safeTransferFrom(msg.sender, address(this), amount);
        shares[msg.sender] += amount;
    }

    function depositAll() external {
        uint256 amount = IERC20(want).balanceOf(msg.sender);
        IERC20(want).safeTransferFrom(msg.sender, address(this), amount);
        shares[msg.sender] += amount;
    }
}
