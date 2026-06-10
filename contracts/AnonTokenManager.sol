// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IAnonTokenManager } from "./interfaces/IAnonTokenManager.sol";
import { IAnonZapRouter } from "./interfaces/IAnonZapRouter.sol";

/// @title AnonTokenManager
/// @author HeyAnon
/// @notice Holds user token approvals separately from the router.
///         Users approve this contract, and the router calls pullTokens to batch-transfer
///         tokens into itself during executeOrder.
/// @dev Created inside the AnonZapRouter constructor. The router address is
///      immutable — there is no admin, no owner, no way to change it. If the router
///      needs to be replaced, a new TokenManager is deployed with the new router.
contract AnonTokenManager is IAnonTokenManager {
    using SafeERC20 for IERC20;

    /// @inheritdoc IAnonTokenManager
    address public immutable override router;

    /// @notice Initializes the TokenManager, locking the deployer as the sole authorized router
    constructor() {
        router = msg.sender;
    }

    /// @inheritdoc IAnonTokenManager
    function pullTokens(address user, IAnonZapRouter.Input[] calldata inputs) external override {
        if (msg.sender != router) revert NotRouter(msg.sender);
        uint256 inputLength = inputs.length;
        for (uint256 i; i < inputLength; ) {
            IAnonZapRouter.Input calldata input = inputs[i];
            unchecked {
                ++i;
            }
            if (input.token == address(0)) continue;
            IERC20(input.token).safeTransferFrom(user, msg.sender, input.amount);
        }
    }
}
