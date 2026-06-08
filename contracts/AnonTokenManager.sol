// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAnonTokenManager} from "./interfaces/IAnonTokenManager.sol";

/**
 * @title AnonTokenManager
 * @notice Holds user token approvals separately from the router.
 * Users approve this contract, and the router calls pullToken to transfer
 * tokens into itself during executeOrder. This separation means router
 * upgrades don't require users to re-approve.
 */
contract AnonTokenManager is IAnonTokenManager, Ownable {
    using SafeERC20 for IERC20;

    address public override router;

    modifier onlyRouter() {
        if (msg.sender != router) revert NotRouter(msg.sender);
        _;
    }

    constructor(address _owner) Ownable(_owner) {}

    function setRouter(address newRouter) external override onlyOwner {
        emit RouterUpdated(router, newRouter);
        router = newRouter;
    }

    function pullToken(
        address user,
        address token,
        uint256 amount
    ) external override onlyRouter {
        IERC20(token).safeTransferFrom(user, msg.sender, amount);
    }
}
