// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IConvexBooster {
    struct PoolInfo {
        address lptoken;
        address token;
        address gauge;
        address crvRewards;
        address stash;
        bool shutdown;
    }

    function deposit(uint256 pid, uint256 amount, bool stake) external returns (bool);

    function depositAll(uint256 pid, bool stake) external returns (bool);

    function withdraw(uint256 pid, uint256 amount) external returns (bool);

    function withdrawAll(uint256 pid) external returns (bool);

    function poolInfo(uint256 pid) external view returns (PoolInfo memory);

    function poolLength() external view returns (uint256);
}
