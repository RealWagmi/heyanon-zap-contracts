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

/**
 * @notice Mock swap that only consumes part of the input, leaving "dust" on the caller.
 */
contract MockPartialSwap {
    using SafeERC20 for IERC20;

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 maxAmountIn,
        uint256 amountOut,
        address recipient
    ) external {
        uint256 consumed = maxAmountIn - (maxAmountIn / 100); // consumes 99%, leaves 1% dust
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), consumed);
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}

/**
 * @notice Mock vault that accepts native ETH deposits (simulates WETH.deposit or ETH staking).
 */
contract MockETHVault {
    mapping(address => uint256) public deposits;
    uint256 public lastAmount;

    function deposit() external payable {
        deposits[msg.sender] += msg.value;
    }

    function depositWithAmount(uint256 amount) external payable {
        require(msg.value == amount, "value mismatch");
        deposits[msg.sender] += msg.value;
        lastAmount = amount;
    }

    receive() external payable {}
}

/**
 * @notice Contract that rejects ETH transfers (no receive/fallback).
 * Used to test EtherTransferFailed reverts.
 */
contract MockNoReceive {
    // intentionally no receive() or fallback()
}

/**
 * @notice A caller contract that can execute zap orders but cannot receive ETH.
 * This tests the _sweepDust revert path when order.user (msg.sender) rejects ETH.
 */
interface IAnonZapRouterMinimal {
    struct Input {
        address token;
        uint256 amount;
    }
    struct Output {
        address token;
        uint256 minOutputAmount;
    }
    struct Order {
        Input[] inputs;
        Output[] outputs;
        address user;
        address recipient;
    }
    struct StepToken {
        address token;
        int256 index;
    }
    struct Step {
        address target;
        uint256 value;
        bytes data;
        StepToken[] tokens;
    }
    function executeOrder(Order calldata order, Step[] calldata steps) external payable;
}

contract MockCallerNoReceive {
    function callZap(
        address router,
        IAnonZapRouterMinimal.Order calldata order,
        IAnonZapRouterMinimal.Step[] calldata steps
    ) external payable {
        IAnonZapRouterMinimal(router).executeOrder{ value: msg.value }(order, steps);
    }
    // No receive() — ETH dust sweep back to this contract will fail
}
