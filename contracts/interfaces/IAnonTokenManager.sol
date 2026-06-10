// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IAnonZapRouter } from "./IAnonZapRouter.sol";

/// @title IAnonTokenManager
/// @notice Interface for the token approval manager that pulls user tokens on behalf of the router.
///         Users approve this contract once; it transfers tokens to the router during zap execution.
interface IAnonTokenManager {
    /// @notice Emitted when a non-router address attempts to call pullTokens
    /// @param caller The unauthorized address
    error NotRouter(address caller);

    /// @notice Returns the immutable router address that is authorized to trigger pulls
    /// @return The AnonZapRouter contract address
    function router() external view returns (address);

    /// @notice Transfer input tokens from the user to the router.
    ///         Skips native ETH entries (address(0)) automatically.
    /// @param user Address to pull tokens from (must have approved this contract)
    /// @param inputs Array of token/amount pairs to transfer
    function pullTokens(address user, IAnonZapRouter.Input[] calldata inputs) external;
}
