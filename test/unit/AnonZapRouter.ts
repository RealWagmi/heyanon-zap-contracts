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

    // Deploy Router (TokenManager is created automatically in constructor)
    router = await viem.deployContract("AnonZapRouter", [
      owner.account.address,
    ]);

    // Get TokenManager address from router
    const tokenManagerAddress = await router.read.tokenManager();
    tokenManager = await viem.getContractAt(
      "AnonTokenManager",
      tokenManagerAddress,
    );

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
    await tokenA.write.approve([tokenManagerAddress, amount], {
      account: user.account,
    });
  });

  describe("deployment", () => {
    it("should create TokenManager with immutable router reference", async () => {
      const tmRouter = await tokenManager.read.router();
      assert.equal(
        getAddress(tmRouter),
        getAddress(router.address),
      );
    });

    it("should set tokenManager as immutable in router", async () => {
      const tmAddr = await router.read.tokenManager();
      assert.notEqual(tmAddr, zeroAddress);
    });
  });

  describe("executeOrder - basic flow", () => {
    it("should execute a single swap step and return output to recipient", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("95", 18);

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
          tokens: [{ token: tokenA.address, index: -1 }],
        },
      ];

      await router.write.executeOrder([order, steps], {
        account: user.account,
      });

      const recipientBalance = await tokenB.read.balanceOf([
        recipient.account.address,
      ]);
      assert.equal(recipientBalance, amountOut);

      const userBalance = await tokenA.read.balanceOf([user.account.address]);
      assert.equal(userBalance, parseUnits("900", 18));
    });

    it("should revert on slippage exceeded", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("50", 18);

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

      const steps = [
        {
          target: mockSwap.address,
          value: 0n,
          data: swapData,
          tokens: [
            { token: tokenA.address, index: -1 },
            { token: tokenA.address, index: 68 },
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

      await router.write.executeOrder([order, []], { account: user.account });
    });

    it("should only allow owner to pause", async () => {
      await assert.rejects(
        router.write.pause([], { account: user.account }),
      );
    });

    it("should revert when caller is not order.user (InvalidCaller)", async () => {
      const order = {
        inputs: [],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      // owner tries to execute order on behalf of user — should fail
      await assert.rejects(
        router.write.executeOrder([order, []], { account: owner.account }),
      );
    });

    it("should revert when step targets tokenManager (TargetNotAllowed)", async () => {
      const amountIn = parseUnits("100", 18);
      const tokenManagerAddress = await router.read.tokenManager();

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [{ token: tokenA.address, minOutputAmount: 0n }],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: tokenManagerAddress,
          value: 0n,
          data: "0x",
          tokens: [],
        },
      ];

      await assert.rejects(
        router.write.executeOrder([order, steps], { account: user.account }),
      );
    });

    it("should revert when step targets router itself (TargetNotAllowed)", async () => {
      const order = {
        inputs: [],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: router.address,
          value: 0n,
          data: "0x",
          tokens: [],
        },
      ];

      await assert.rejects(
        router.write.executeOrder([order, steps], { account: user.account }),
      );
    });

    it("should use dynamic ETH value when stepToken is address(0)", async () => {
      const ethAmount = parseUnits("1", 18);

      const mockVault = await viem.deployContract("MockETHVault");

      // Build calldata for mockVault.deposit()
      const depositData = encodeFunctionData({
        abi: [
          {
            name: "deposit",
            type: "function",
            inputs: [],
            outputs: [],
            stateMutability: "payable",
          },
        ],
        functionName: "deposit",
      });

      const order = {
        inputs: [{ token: zeroAddress, amount: ethAmount }],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      // address(0) with index -1: dynamic ETH value (use full balance as msg.value)
      const steps = [
        {
          target: mockVault.address,
          value: 0n,
          data: depositData,
          tokens: [{ token: zeroAddress, index: -1 }],
        },
      ];

      await router.write.executeOrder([order, steps], {
        account: user.account,
        value: ethAmount,
      });

      // Verify the vault received the ETH
      const publicClient = await viem.getPublicClient();
      const vaultBalance = await publicClient.getBalance({
        address: mockVault.address,
      });
      assert.equal(vaultBalance, ethAmount);
    });
  });

  describe("executeOrder - InvalidRecipient", () => {
    it("should revert when recipient is address(0)", async () => {
      const amountIn = parseUnits("100", 18);

      const order = {
        inputs: [{ token: tokenA.address, amount: amountIn }],
        outputs: [{ token: tokenB.address, minOutputAmount: 0n }],
        user: user.account.address,
        recipient: zeroAddress,
      };

      await assert.rejects(
        router.write.executeOrder([order, []], { account: user.account }),
      );
    });
  });

  describe("executeOrder - auto-sweep dust", () => {
    it("should return ERC20 dust to user after zap", async () => {
      const amountIn = parseUnits("100", 18);
      const amountOut = parseUnits("95", 18);

      // Deploy partial swap (consumes 99% of input, leaves 1% as dust)
      const partialSwap = await viem.deployContract("MockPartialSwap");

      // Fund the partial swap with tokenB for output
      await tokenB.write.mint([partialSwap.address, parseUnits("1000", 18)]);

      // User approves full amount
      await tokenA.write.approve(
        [await router.read.tokenManager(), amountIn],
        { account: user.account },
      );

      const swapData = encodeFunctionData({
        abi: [
          {
            name: "swap",
            type: "function",
            inputs: [
              { name: "tokenIn", type: "address" },
              { name: "tokenOut", type: "address" },
              { name: "maxAmountIn", type: "uint256" },
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
        outputs: [{ token: tokenB.address, minOutputAmount: amountOut }],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      const steps = [
        {
          target: partialSwap.address,
          value: 0n,
          data: swapData,
          tokens: [{ token: tokenA.address, index: -1 }],
        },
      ];

      const userBalanceBefore = await tokenA.read.balanceOf([
        user.account.address,
      ]);

      await router.write.executeOrder([order, steps], {
        account: user.account,
      });

      const userBalanceAfter = await tokenA.read.balanceOf([
        user.account.address,
      ]);

      // User should have received dust back (1% of amountIn = 1 token)
      const expectedDust = amountIn / 100n;
      const recovered = userBalanceAfter - (userBalanceBefore - amountIn);
      assert.equal(recovered, expectedDust);

      // Router should have zero balance
      const routerBalance = await tokenA.read.balanceOf([router.address]);
      assert.equal(routerBalance, 0n);
    });

    it("should return native ETH dust to user after zap", async () => {
      const ethAmount = parseUnits("1", 18);

      // Deploy a mock that accepts partial ETH (leaves some dust)
      const mockVault = await viem.deployContract("MockETHVault");

      // Build calldata for deposit with fixed value (not full balance)
      // We send 1 ETH but the step uses a fixed value of 0.9 ETH
      const depositData = encodeFunctionData({
        abi: [
          {
            name: "deposit",
            type: "function",
            inputs: [],
            outputs: [],
            stateMutability: "payable",
          },
        ],
        functionName: "deposit",
      });

      const depositAmount = parseUnits("0.9", 18);

      const order = {
        inputs: [{ token: zeroAddress, amount: ethAmount }],
        outputs: [],
        user: user.account.address,
        recipient: recipient.account.address,
      };

      // Use a fixed step.value (not dynamic) — leaves 0.1 ETH as dust
      const steps = [
        {
          target: mockVault.address,
          value: depositAmount,
          data: depositData,
          tokens: [],
        },
      ];

      const publicClient = await viem.getPublicClient();
      const userEthBefore = await publicClient.getBalance({
        address: user.account.address,
      });

      await router.write.executeOrder([order, steps], {
        account: user.account,
        value: ethAmount,
      });

      const userEthAfter = await publicClient.getBalance({
        address: user.account.address,
      });

      // User paid 1 ETH in gas+value, but got 0.1 ETH dust back
      // Net cost should be ~0.9 ETH + gas (not full 1 ETH + gas)
      const netSpent = userEthBefore - userEthAfter;
      // netSpent should be less than 1 ETH (got 0.1 back as dust)
      // accounting for gas, it should be around 0.9 ETH + some gas
      assert.ok(netSpent < ethAmount, "User should have received ETH dust back");

      // Router should have zero ETH balance
      const routerEth = await publicClient.getBalance({
        address: router.address,
      });
      assert.equal(routerEth, 0n);
    });
  });

  describe("AnonTokenManager", () => {
    it("should only allow router to pull tokens", async () => {
      const inputs = [{ token: tokenA.address, amount: parseUnits("10", 18) }];
      await assert.rejects(
        tokenManager.write.pullTokens(
          [user.account.address, inputs],
          { account: user.account },
        ),
      );
    });

    it("should have immutable router (no setRouter function)", async () => {
      const tmRouter = await tokenManager.read.router();
      assert.equal(getAddress(tmRouter), getAddress(router.address));
    });
  });
});
