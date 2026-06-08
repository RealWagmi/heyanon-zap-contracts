// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { IAnonZapRouter } from "./IAnonZapRouter.sol";

interface IAnonTokenManager {
    error NotRouter(address caller);

    function router() external view returns (address);

    function pullTokens(address user, IAnonZapRouter.Input[] calldata inputs) external;
}
