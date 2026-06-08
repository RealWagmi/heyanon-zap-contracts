// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {IAnonZapRouter} from "./interfaces/IAnonZapRouter.sol";
import {IAnonTokenManager} from "./interfaces/IAnonTokenManager.sol";

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
contract AnonZapRouter is IAnonZapRouter, Ownable, Pausable {
    using SafeERC20 for IERC20;
    using Address for address;

    address private _tokenManager;

    constructor(address owner_, address tokenManager_) Ownable(owner_) {
        _tokenManager = tokenManager_;
    }

    receive() external payable {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function tokenManager() external view override returns (address) {
        return _tokenManager;
    }

    function setTokenManager(address newManager) external onlyOwner {
        _tokenManager = newManager;
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    function executeOrder(
        Order calldata order,
        Step[] calldata steps
    ) external payable override whenNotPaused {
        _pullInputs(order);
        _executeSteps(steps);
        _validateAndReturn(order);

        emit OrderExecuted(
            order.user,
            order.recipient,
            order.inputs.length,
            steps.length
        );
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _pullInputs(Order calldata order) internal {
        IAnonTokenManager mgr = IAnonTokenManager(_tokenManager);
        for (uint256 i = 0; i < order.inputs.length; i++) {
            Input calldata input = order.inputs[i];
            if (input.token == address(0)) {
                if (msg.value < input.amount) {
                    revert InsufficientInput(address(0), input.amount, msg.value);
                }
            } else {
                mgr.pullToken(order.user, input.token, input.amount);
            }
        }
    }

    function _executeSteps(Step[] calldata steps) internal {
        for (uint256 i = 0; i < steps.length; i++) {
            Step calldata step = steps[i];

            bytes memory callData = step.data;

            for (uint256 j = 0; j < step.tokens.length; j++) {
                StepToken calldata st = step.tokens[j];
                uint256 balance = _getBalance(st.token);

                if (st.index >= 0) {
                    _patchAmount(callData, uint256(int256(st.index)), balance);
                } else {
                    // index == -1: approve full balance to step target
                    IERC20(st.token).forceApprove(step.target, balance);
                }
            }

            (bool success, bytes memory result) = step.target.call{value: step.value}(callData);
            if (!success) {
                // Bubble up revert reason or emit our custom error
                if (result.length > 0) {
                    assembly {
                        revert(add(result, 32), mload(result))
                    }
                }
                revert CallFailed(step.target, step.value, callData);
            }

            // Reset approvals after step execution
            for (uint256 j = 0; j < step.tokens.length; j++) {
                StepToken calldata st = step.tokens[j];
                if (st.index < 0) {
                    IERC20(st.token).forceApprove(step.target, 0);
                }
            }
        }
    }

    function _validateAndReturn(Order calldata order) internal {
        address recipient = order.recipient;

        for (uint256 i = 0; i < order.outputs.length; i++) {
            Output calldata output = order.outputs[i];
            uint256 balance = _getBalance(output.token);

            if (balance < output.minOutputAmount) {
                revert SlippageExceeded(output.token, output.minOutputAmount, balance);
            }

            if (balance > 0) {
                if (output.token == address(0)) {
                    (bool sent, ) = recipient.call{value: balance}("");
                    require(sent, "ETH transfer failed");
                } else {
                    IERC20(output.token).safeTransfer(recipient, balance);
                }
                emit TokenReturned(output.token, recipient, balance);
            }
        }
    }

    function _getBalance(address token) internal view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @dev Patches a uint256 value into calldata at a specific byte offset.
     * The offset points to where the 32-byte uint256 value starts in the data.
     */
    function _patchAmount(bytes memory data, uint256 offset, uint256 amount) internal pure {
        require(offset + 32 <= data.length, "patch out of bounds");
        assembly {
            mstore(add(add(data, 32), offset), amount)
        }
    }
}
