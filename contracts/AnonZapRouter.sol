// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IAnonZapRouter } from "./interfaces/IAnonZapRouter.sol";
import { IAnonTokenManager } from "./interfaces/IAnonTokenManager.sol";
import { AnonTokenManager } from "./AnonTokenManager.sol";

/**
 * @title AnonZapRouter
 * @notice Generic multi-step zap executor. Receives an order (what goes in/out)
 * and a route (sequence of arbitrary external calls). Each step can reference
 * the router's current token balance which gets patched into calldata at runtime.
 *
 * Key design (inspired by BeefyZapRouter):
 * - StepToken.index == -1: approve token to step target (balance injection via full balance)
 * - StepToken.index >= 0: patch the router's token balance into calldata at that byte offset
 * - After all steps, validate output minimums and return tokens to recipient
 */
contract AnonZapRouter is IAnonZapRouter, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Address for address;

    address public immutable override tokenManager;

    modifier onlyOrderUser(address user) {
        if (msg.sender != user) revert InvalidCaller(user, msg.sender);
        _;
    }

    constructor(address owner_) Ownable(owner_) {
        tokenManager = address(new AnonTokenManager());
    }

    receive() external payable {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    function executeOrder(
        Order calldata order,
        Step[] calldata steps
    ) external payable override onlyOrderUser(order.user) whenNotPaused nonReentrant {
        if (order.recipient == address(0)) revert InvalidRecipient();
        _pullInputs(order);
        _executeSteps(steps);
        _validateAndReturn(order);
        _sweepDust(order);

        emit OrderExecuted(order.user, order.recipient, order.inputs.length, steps.length);
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _pullInputs(Order calldata order) internal {
        _validateNativeInput(order.inputs);
        IAnonTokenManager(tokenManager).pullTokens(order.user, order.inputs);
    }

    function _validateNativeInput(Input[] calldata inputs) internal view {
        uint256 inputsLength = inputs.length;
        for (uint256 i; i < inputsLength; ) {
            if (inputs[i].token == address(0)) {
                if (msg.value < inputs[i].amount) {
                    revert InsufficientInput(address(0), inputs[i].amount, msg.value);
                }
                return;
            }
            unchecked {
                ++i;
            }
        }
    }

    function _executeSteps(Step[] calldata steps) internal {
        uint256 stepsLength = steps.length;
        for (uint256 i; i < stepsLength; ) {
            Step calldata step = steps[i];

            if (step.target == tokenManager || step.target == address(this))
                revert TargetNotAllowed(step.target);

            bytes memory callData = step.data;
            uint256 callValue = step.value;
            uint256 tokensLength = step.tokens.length;

            for (uint256 j; j < tokensLength; ) {
                StepToken calldata st = step.tokens[j];

                if (st.token == address(0)) {
                    callValue = address(this).balance;
                    if (st.index >= 0) _patchAmount(callData, uint256(int256(st.index)), callValue);
                } else {
                    uint256 balance = IERC20(st.token).balanceOf(address(this));
                    if (st.index >= 0) {
                        _patchAmount(callData, uint256(int256(st.index)), balance);
                    } else {
                        IERC20(st.token).forceApprove(step.target, balance);
                    }
                }
                unchecked {
                    ++j;
                }
            }

            (bool success, bytes memory result) = step.target.call{ value: callValue }(callData);
            if (!success) {
                if (result.length > 0) {
                    assembly {
                        revert(add(result, 32), mload(result))
                    }
                }
                revert CallFailed(step.target, callValue, callData);
            }

            for (uint256 j; j < tokensLength; ) {
                StepToken calldata st = step.tokens[j];
                if (st.index < 0 && st.token != address(0)) {
                    IERC20(st.token).forceApprove(step.target, 0);
                }
                unchecked {
                    ++j;
                }
            }

            unchecked {
                ++i;
            }
        }
    }

    function _validateAndReturn(Order calldata order) internal {
        address recipient = order.recipient;
        uint256 outputsLength = order.outputs.length;

        for (uint256 i; i < outputsLength; ) {
            Output calldata output = order.outputs[i];
            uint256 balance = _getBalance(output.token);

            if (balance < output.minOutputAmount) {
                revert SlippageExceeded(output.token, output.minOutputAmount, balance);
            }

            if (balance > 0) {
                if (output.token == address(0)) {
                    (bool sent, ) = recipient.call{ value: balance }("");
                    if (!sent) revert EtherTransferFailed(recipient);
                } else {
                    IERC20(output.token).safeTransfer(recipient, balance);
                }
                emit TokenReturned(output.token, recipient, balance);
            }

            unchecked {
                ++i;
            }
        }
    }

    function _sweepDust(Order calldata order) internal {
        address user = order.user;
        uint256 inputsLength = order.inputs.length;
        for (uint256 i; i < inputsLength; ) {
            Input calldata input = order.inputs[i];
            if (input.token != address(0)) {
                uint256 dust = IERC20(input.token).balanceOf(address(this));
                if (dust > 0) {
                    IERC20(input.token).safeTransfer(user, dust);
                }
            } else {
                uint256 dust = address(this).balance;
                if (dust > 0) {
                    (bool sent, ) = user.call{ value: dust }("");
                    if (!sent) revert EtherTransferFailed(user);
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    function _getBalance(address token) internal view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    function _patchAmount(bytes memory data, uint256 offset, uint256 amount) internal pure {
        if (offset + 32 > data.length) revert CallFailed(address(0), 0, data);
        assembly {
            mstore(add(add(data, 32), offset), amount)
        }
    }
}
