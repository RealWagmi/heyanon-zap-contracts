import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import {
  getAddress,
  parseUnits,
  encodeFunctionData,
  zeroAddress,
} from "viem";

describe("AnonZapRouter", function () {
  let viem: any;
  let networkHelpers: any;
  let owner: any;
  let user: any;
  let recipient: any;
  let router: any;
  let tokenManager: any;
  let tokenA: any;
  let tokenB: any;
  let mockSwap: any;

  beforeEach(async () => {
    const conn = await network.create();
    viem = conn.viem;
    networkHelpers = conn.networkHelpers;

    const [_owner, _user, _recipient] = await viem.getWalletClients();
    owner = _owner;
    user = _user;
    recipient = _recipient;

    // Deploy TokenManager
    tokenManager = await viem.deployContract("AnonTokenManager", [
      owner.account.address,
    ]);

    // Deploy Router
    router = await viem.deployContract("AnonZapRouter", [
      owner.account.address,
      tokenManager.address,
    ]);

    // Set router in token manager
    await tokenManager.write.setRouter([router.address], {
      account: owner.account,
    });

    // Deploy mock tokens
    tokenA = await viem.deployContract("MockERC20", ["Token A", "TKA", 18]);
    tokenB = await viem.deployContract("MockERC20", ["Token B", "TKB", 18]);

    // Deploy mock swap target
    mockSwap = await viem.deployContract("MockSwapTarget");

    // Mint tokens to user and mock swap
    const amount = parseUnits("1000", 18);
    await tokenA.write.mint([user.account.address, amount]);
    await tokenB.write.mint([mockSwap.address, amount]);

    // User approves TokenManager
    await tokenA.write.approve([tokenManager.address, amount], {
      account: user.account,
    });
  });

  describe("executeOrder - basic flow", () => {
    it("should execute a single swap step and return output to recipient", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("95", 18);

      // Build swap calldata: swap(tokenA, tokenB, amountIn, amountOut, router)
      const swapData = encodeFunctionData({
        abi: [
          {
            name: "swap",
            type: "function",
            inputs: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOut", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "swap",
        args: [
          tokenA.address,
          tokenB.address,
          amountIn,
          amountOut,
          router.address,
        ],
      });

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [
          { token: tokenB.address, minOutputAmount: parseUnits("90", 18) },
        ],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: mockSwap.address,
          value: 0n,
          data: swapData,
          tokens: [{ token: tokenA.address, index: -1 }], // approve tokenA to mockSwap
        },
      ];

      await router.write.executeOrder([order, steps], {
        account: user.account,
      });

      // Verify recipient received tokenB
      const recipientBalance = await tokenB.read.balanceOf([
        recipient.account.address,
      ]);
      assert.equal(recipientBalance, amountOut);

      // Verify user's tokenA was spent
      const userBalance = await tokenA.read.balanceOf([user.account.address]);
      assert.equal(userBalance, parseUnits("900", 18));
    });

    it("should revert on slippage exceeded", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("50", 18); // only get 50

      const swapData = encodeFunctionData({
        abi: [
          {
            name: "swap",
            type: "function",
            inputs: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOut", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "swap",
        args: [
          tokenA.address,
          tokenB.address,
          amountIn,
          amountOut,
          router.address,
        ],
      });

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [
          { token: tokenB.address, minOutputAmount: parseUnits("90", 18) }, // expect 90, get 50
        ],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: mockSwap.address,
          value: 0n,
          data: swapData,
          tokens: [{ token: tokenA.address, index: -1 }],
        },
      ];

      await assert.rejects(
        router.write.executeOrder([order, steps], {
          account: user.account,
        }),
      );
    });
  });

  describe("executeOrder - balance patching", () => {
    it("should patch token balance into calldata at specified index", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("95", 18);

      // The swap function signature: swap(address,address,uint256,uint256,address)
      // Byte offsets in calldata (after 4-byte selector):
      // tokenIn: offset 0 (bytes 4-35)
      // tokenOut: offset 32 (bytes 36-67)
      // amountIn: offset 64 (bytes 68-99) <-- we want to patch this
      // amountOut: offset 96
      // recipient: offset 128

      const swapData = encodeFunctionData({
        abi: [
          {
            name: "swap",
            type: "function",
            inputs: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "amountIn", type: "uint256" },
              { name: "amountOut", type: "uint256" },
              { name: "recipient", type: "address" },
            ],
            outputs: [],
            stateMutability: "nonpayable",
          },
        ],
        functionName: "swap",
        args: [
          tokenA.address,
          tokenB.address,
          0n, // placeholder - will be patched
          amountOut,
          router.address,
        ],
      });

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [
          { token: tokenB.address, minOutputAmount: parseUnits("90", 18) },
        ],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      // index = 68 = 4 (selector) + 64 (skip first two address params)
      // This patches the amountIn parameter with the router's actual tokenA balance
      const steps = [
        {
          target: mockSwap.address,
          value: 0n,
          data: swapData,
          tokens: [
            { token: tokenA.address, index: -1 }, // approve
            { token: tokenA.address, index: 68 }, // patch amountIn at offset 68
          ],
        },
      ];

      await router.write.executeOrder([order, steps], {
        account: user.account,
      });

      const recipientBalance = await tokenB.read.balanceOf([
        recipient.account.address,
      ]);
      assert.equal(recipientBalance, amountOut);
    });
  });

  describe("executeOrder - step failure", () => {
    it("should revert when a step call fails", async () => {
      const amountIn = parseUnits("100", 18);

      const revertTarget = await viem.deployContract("MockRevertTarget");

      const revertData = encodeFunctionData({
        abi: [
          {
            name: "doSomething",
            type: "function",
            inputs: [],
            outputs: [],
            stateMutability: "pure",
          },
        ],
        functionName: "doSomething",
      });

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [{ token: tokenA.address, minOutputAmount: 0n }],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: revertTarget.address,
          value: 0n,
          data: revertData,
          tokens: [],
        },
      ];

      await assert.rejects(
        router.write.executeOrder([order, steps], {
          account: user.account,
        }),
      );
    });
  });

  describe("access control", () => {
    it("should revert when paused", async () => {
      await router.write.pause([], { account: owner.account });

      const order = {
        inputs: [],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      await assert.rejects(
        router.write.executeOrder([order, []], { account: user.account }),
      );
    });

    it("should allow execution after unpause", async () => {
      await router.write.pause([], { account: owner.account });
      await router.write.unpause([], { account: owner.account });

      const order = {
        inputs: [],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      // Should not revert
      await router.write.executeOrder([order, []], { account: user.account });
    });

    it("should only allow owner to pause", async () => {
      await assert.rejects(
        router.write.pause([], { account: user.account }),
      );
    });
  });

  describe("AnonTokenManager", () => {
    it("should only allow router to pull tokens", async () => {
      await assert.rejects(
        tokenManager.write.pullToken(
          [user.account.address, tokenA.address, parseUnits("10", 18)],
          { account: user.account },
        ),
      );
    });

    it("should only allow owner to set router", async () => {
      await assert.rejects(
        tokenManager.write.setRouter([user.account.address], {
          account: user.account,
        }),
      );
    });
  });
});
