import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import {
  parseUnits,
  encodeFunctionData,
  getAddress,
  erc20Abi,
} from "viem";

/**
 * Fork integration test: USDC -> Curve 3pool -> Convex deposit
 *
 * Run with: MAINNET_RPC_URL=<your_url> npx hardhat test test/fork/ConvexZap.ts --network mainnetFork
 *
 * This test demonstrates AnonZapRouter executing a full multi-step zap:
 * 1. Pull USDC from user via TokenManager
 * 2. Approve USDC to Curve 3pool
 * 3. add_liquidity to Curve 3pool (USDC only -> receive 3CRV LP)
 * 4. Approve 3CRV to Convex Booster
 * 5. Convex Booster.deposit(pid, amount, true) -> stake in BaseRewardPool
 */

// Mainnet addresses
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const THREE_POOL = "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1c7";
const THREE_CRV = "0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490";
const CONVEX_BOOSTER = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31";
const CONVEX_3POOL_PID = 9n; // 3pool pid on Convex
const CONVEX_3POOL_REWARD = "0x689440f2Ff927E1f24c72F1087E1FAF471eCe1c8";

// Whale with lots of USDC
const USDC_WHALE = "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503";

describe("ConvexZap (fork)", function () {
  let viem: any;
  let networkHelpers: any;
  let owner: any;
  let user: any;
  let router: any;
  let tokenManager: any;
  let publicClient: any;

  beforeEach(async () => {
    const conn = await network.create("mainnetFork");
    viem = conn.viem;
    networkHelpers = conn.networkHelpers;
    publicClient = await viem.getPublicClient();

    const [_owner] = await viem.getWalletClients();
    owner = _owner;

    // Deploy our contracts
    tokenManager = await viem.deployContract("AnonTokenManager", [
      owner.account.address,
    ]);

    router = await viem.deployContract("AnonZapRouter", [
      owner.account.address,
      tokenManager.address,
    ]);

    await tokenManager.write.setRouter([router.address], {
      account: owner.account,
    });

    // Impersonate whale as our user
    await networkHelpers.impersonateAccount(USDC_WHALE);
    await networkHelpers.setBalance(USDC_WHALE, parseUnits("10", 18));
    user = { account: { address: getAddress(USDC_WHALE) } };
  });

  it("should zap USDC -> Curve 3pool LP -> Convex staked position", async () => {
    const usdcAmount = parseUnits("10000", 6); // 10,000 USDC

    // User approves TokenManager for USDC
    await publicClient.request({
      method: "eth_sendTransaction" as any,
      params: [
        {
          from: USDC_WHALE,
          to: USDC,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [tokenManager.address, usdcAmount],
          }),
        },
      ],
    });

    // Build the multi-step zap:
    // Step 1: Approve USDC to Curve 3pool (router approves its USDC balance)
    // Step 2: add_liquidity to 3pool with USDC only [0, usdcAmount, 0]
    // Step 3: Approve 3CRV to Convex Booster
    // Step 4: Convex deposit(pid, amount, true)

    // Curve 3pool add_liquidity: amounts = [DAI, USDC, USDT], min_mint = 0
    const addLiquidityData = encodeFunctionData({
      abi: [
        {
          name: "add_liquidity",
          type: "function",
          inputs: [
            { name: "amounts", type: "uint256[3]" },
            { name: "min_mint_amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "add_liquidity",
      args: [[0n, usdcAmount, 0n], 0n],
    });

    // Convex deposit(pid, amount, stake)
    // amount will be patched at runtime with router's 3CRV balance
    const depositData = encodeFunctionData({
      abi: [
        {
          name: "deposit",
          type: "function",
          inputs: [
            { name: "_pid", type: "uint256" },
            { name: "_amount", type: "uint256" },
            { name: "_stake", type: "bool" },
          ],
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "deposit",
      args: [CONVEX_3POOL_PID, 0n, true], // amount placeholder, will be patched
    });

    const order = {
      inputs: [{ token: getAddress(USDC), amount: usdcAmount }],
      outputs: [
        { token: getAddress(THREE_CRV), minOutputAmount: 0n }, // dust return
      ],
      user: getAddress(USDC_WHALE),
      recipient: getAddress(USDC_WHALE),
    };

    const steps = [
      // Step 1: Approve USDC to 3pool
      {
        target: getAddress(THREE_POOL),
        value: 0n,
        data: addLiquidityData,
        tokens: [
          { token: getAddress(USDC), index: -1 }, // approve USDC to 3pool
        ],
      },
      // Step 2: Approve 3CRV to Convex Booster + deposit
      {
        target: getAddress(CONVEX_BOOSTER),
        value: 0n,
        data: depositData,
        tokens: [
          { token: getAddress(THREE_CRV), index: -1 }, // approve 3CRV to booster
          { token: getAddress(THREE_CRV), index: 36 }, // patch _amount (offset: 4 selector + 32 pid = 36)
        ],
      },
    ];

    // Execute the zap from the whale
    await publicClient.request({
      method: "eth_sendTransaction" as any,
      params: [
        {
          from: USDC_WHALE,
          to: router.address,
          data: encodeFunctionData({
            abi: [
              {
                name: "executeOrder",
                type: "function",
                inputs: [
                  {
                    name: "order",
                    type: "tuple",
                    components: [
                      {
                        name: "inputs",
                        type: "tuple[]",
                        components: [
                          { name: "token", type: "address" },
                          { name: "amount", type: "uint256" },
                        ],
                      },
                      {
                        name: "outputs",
                        type: "tuple[]",
                        components: [
                          { name: "token", type: "address" },
                          { name: "minOutputAmount", type: "uint256" },
                        ],
                      },
                      { name: "user", type: "address" },
                      { name: "recipient", type: "address" },
                    ],
                  },
                  {
                    name: "steps",
                    type: "tuple[]",
                    components: [
                      { name: "target", type: "address" },
                      { name: "value", type: "uint256" },
                      { name: "data", type: "bytes" },
                      {
                        name: "tokens",
                        type: "tuple[]",
                        components: [
                          { name: "token", type: "address" },
                          { name: "index", type: "int32" },
                        ],
                      },
                    ],
                  },
                ],
                outputs: [],
                stateMutability: "payable",
              },
            ],
            functionName: "executeOrder",
            args: [order, steps],
          }),
          gas: "0x" + (3000000).toString(16),
        },
      ],
    });

    // Verify: check that the whale now has a staked position in Convex
    // The BaseRewardPool tracks staked balances
    const stakedBalance = await publicClient.readContract({
      address: getAddress(CONVEX_3POOL_REWARD),
      abi: [
        {
          name: "balanceOf",
          type: "function",
          inputs: [{ name: "account", type: "address" }],
          outputs: [{ name: "", type: "uint256" }],
          stateMutability: "view",
        },
      ],
      functionName: "balanceOf",
      args: [router.address],
    });

    // Router should have staked position (Convex stakes for msg.sender which is router)
    console.log(`  Staked 3CRV in Convex BaseRewardPool: ${stakedBalance}`);
    assert.ok(stakedBalance > 0n, "Should have staked position in Convex");
  });
});
