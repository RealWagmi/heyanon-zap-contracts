// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IBaseRewardPool {
    function balanceOf(address account) external view returns (uint256);

    function earned(address account) external view returns (uint256);

    function getReward(address account, bool claimExtras) external returns (bool);

    function stake(uint256 amount) external returns (bool);

    function stakeFor(address account, uint256 amount) external returns (bool);

    function withdraw(uint256 amount, bool claim) external returns (bool);

    function withdrawAndUnwrap(uint256 amount, bool claim) external returns (bool);

    function stakingToken() external view returns (address);

    function rewardToken() external view returns (address);
}
