// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @notice Minimal Curve pool interface covering common pool types.
 * Curve pools have varied signatures; these cover the most common patterns.
 */
interface ICurvePool3 {
    function add_liquidity(uint256[3] calldata amounts, uint256 min_mint_amount) external returns (uint256);

    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256);

    function calc_token_amount(uint256[3] calldata amounts, bool is_deposit) external view returns (uint256);

    function coins(uint256 i) external view returns (address);

    function get_virtual_price() external view returns (uint256);
}

interface ICurvePool2 {
    function add_liquidity(uint256[2] calldata amounts, uint256 min_mint_amount) external returns (uint256);

    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256);

    function calc_token_amount(uint256[2] calldata amounts, bool is_deposit) external view returns (uint256);

    function coins(uint256 i) external view returns (address);

    function get_virtual_price() external view returns (uint256);
}

interface ICurvePool4 {
    function add_liquidity(uint256[4] calldata amounts, uint256 min_mint_amount) external returns (uint256);

    function remove_liquidity_one_coin(uint256 token_amount, int128 i, uint256 min_amount) external returns (uint256);

    function calc_token_amount(uint256[4] calldata amounts, bool is_deposit) external view returns (uint256);

    function coins(uint256 i) external view returns (address);

    function get_virtual_price() external view returns (uint256);
}
