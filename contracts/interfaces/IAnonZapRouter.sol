// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAnonZapRouter {
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
        int32 index;
    }

    struct Step {
        address target;
        uint256 value;
        bytes data;
        StepToken[] tokens;
    }

    error CallFailed(address target, uint256 value, bytes data);
    error SlippageExceeded(address token, uint256 minAmount, uint256 actualAmount);
    error TargetNotAllowed(address target);
    error InsufficientInput(address token, uint256 required, uint256 available);
    error InvalidCaller(address expected, address actual);
    error EtherTransferFailed(address recipient);
    error InvalidRecipient();

    event OrderExecuted(
        address indexed user,
        address indexed recipient,
        uint256 inputCount,
        uint256 stepCount
    );

    event TokenReturned(address indexed token, address indexed recipient, uint256 amount);

    function executeOrder(Order calldata order, Step[] calldata steps) external payable;

    function tokenManager() external view returns (address);
}
