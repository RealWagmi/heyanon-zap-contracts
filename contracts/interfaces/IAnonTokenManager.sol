// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAnonTokenManager {
    error NotRouter(address caller);
    error RouterAlreadySet();

    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    function router() external view returns (address);

    function pullToken(address user, address token, uint256 amount) external;

    function setRouter(address newRouter) external;
}
