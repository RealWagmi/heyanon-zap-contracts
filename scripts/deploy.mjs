#!/usr/bin/env node

/**
 * Deploy AnonZapRouter to any EVM chain and report gas costs.
 * Chain is detected automatically from the RPC endpoint.
 *
 * Usage:
 *   npm run deploy                     # uses DEPLOY_RPC from .env (or local fork fallback)
 *   DEPLOY_RPC=https://base... npm run deploy   # override inline for Base
 *
 * Env vars (in .env):
 *   DEPLOY_RPC           - Target RPC endpoint (default: http://127.0.0.1:8545)
 *   DEPLOYER_PRIVATE_KEY - Deployer private key (if not set, uses first Hardhat account)
 *   DEPLOY_OWNER         - Router owner address (default: deployer)
 *   GAS_PRICE_GWEI       - Override gas price in gwei for cost estimation (optional)
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createPublicClient,
	createWalletClient,
	http,
	getAddress,
	formatEther,
	formatGwei,
	parseGwei,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RPC_URL = process.env.DEPLOY_RPC || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const OWNER_OVERRIDE = process.env.DEPLOY_OWNER;
const GAS_PRICE_GWEI = process.env.GAS_PRICE_GWEI;

const artifactPath = resolve(__dirname, "../artifacts/contracts/AnonZapRouter.sol/AnonZapRouter.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));

const transport = http(RPC_URL, { timeout: 60_000 });

// Resolve chain dynamically from RPC
const tempClient = createPublicClient({ transport });
const chainId = await tempClient.getChainId();

const chain = resolveChain(chainId, RPC_URL);

const publicClient = createPublicClient({ chain, transport });

console.log("═".repeat(60));
console.log("  AnonZapRouter Deploy Script");
console.log("═".repeat(60));
console.log(`  Network: ${chain.name} (chainId: ${chainId})`);
console.log(`  RPC: ${RPC_URL}`);

let deployer;
let walletClient;

if (PRIVATE_KEY) {
	const account = privateKeyToAccount(PRIVATE_KEY);
	deployer = account.address;
	walletClient = createWalletClient({ account, chain, transport });
} else {
	const accounts = await publicClient.request({ method: "eth_accounts" });
	if (!accounts || accounts.length === 0) {
		console.error("❌ No accounts available. Set DEPLOYER_PRIVATE_KEY in .env or use a Hardhat node.");
		process.exit(1);
	}
	deployer = getAddress(accounts[0]);
	walletClient = createWalletClient({ account: deployer, chain, transport });
}

const owner = OWNER_OVERRIDE ? getAddress(OWNER_OVERRIDE) : deployer;
console.log(`  Deployer: ${deployer}`);
console.log(`  Owner: ${owner}`);

const balance = await publicClient.getBalance({ address: deployer });
console.log(`  Balance: ${formatEther(balance)} ${chain.nativeCurrency.symbol}`);
console.log("─".repeat(60));

const gasPrice = GAS_PRICE_GWEI
	? parseGwei(GAS_PRICE_GWEI)
	: await publicClient.getGasPrice();

console.log(`  Gas price: ${formatGwei(gasPrice)} gwei`);
console.log("\n" + "─".repeat(60));
console.log("🔨 Deploying AnonZapRouter...\n");

const deployHash = await walletClient.deployContract({
	abi: artifact.abi,
	bytecode: artifact.bytecode,
	args: [owner],
});

console.log(`  Tx hash: ${deployHash}`);
console.log("  Waiting for confirmation...");

const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });

const routerAddress = getAddress(receipt.contractAddress);
const actualGasUsed = receipt.gasUsed;
const effectiveGasPrice = receipt.effectiveGasPrice ?? gasPrice;
const actualCost = actualGasUsed * effectiveGasPrice;

console.log(`\n  ✅ AnonZapRouter deployed!`);
console.log(`     Address: ${routerAddress}`);
console.log(`     Gas used: ${actualGasUsed.toLocaleString()}`);
console.log(`     Cost: ${formatEther(actualCost)} ${chain.nativeCurrency.symbol}`);
console.log(`     Block: ${receipt.blockNumber}`);

const tokenManagerAddress = await publicClient.readContract({
	address: routerAddress,
	abi: artifact.abi,
	functionName: "tokenManager",
});

console.log(`\n  ✅ AnonTokenManager: ${getAddress(tokenManagerAddress)}`);

// --- Summary ---
console.log("\n" + "═".repeat(60));
console.log("  DEPLOYMENT SUMMARY");
console.log("═".repeat(60));
console.log(`  Network:           ${chain.name} (chainId: ${chainId})`);
console.log(`  ANON_ZAP_ROUTER  = ${routerAddress}`);
console.log(`  TOKEN_MANAGER    = ${getAddress(tokenManagerAddress)}`);
console.log(`  OWNER            = ${owner}`);
console.log("─".repeat(60));
console.log(`  Gas used:          ${actualGasUsed.toLocaleString()} units`);
console.log(`  Gas price:         ${formatGwei(effectiveGasPrice)} gwei`);
console.log(`  Deploy cost:       ${formatEther(actualCost)} ${chain.nativeCurrency.symbol}`);

if (chain.blockExplorers?.default) {
	console.log(`  Explorer:          ${chain.blockExplorers.default.url}/address/${routerAddress}`);
}
console.log("═".repeat(60));

// Cost table
console.log("\n📈 Cost estimate at different gas prices:");
console.log("   Gas Price (gwei) │ Deploy Cost (ETH)");
console.log("   ─────────────────┼──────────────────────");
for (const gp of [5n, 10n, 20n, 30n, 50n, 100n]) {
	const cost = actualGasUsed * parseGwei(gp.toString());
	console.log(`   ${String(gp).padStart(15)}   │ ${formatEther(cost)}`);
}
console.log(`\n  ✅ Recommended budget (deploy + initial txs):`);
const budget20gwei = actualGasUsed * parseGwei("20") * 3n;
const budget50gwei = actualGasUsed * parseGwei("50") * 3n;
console.log(`     At 20 gwei: ~${formatEther(budget20gwei)} ${chain.nativeCurrency.symbol}`);
console.log(`     At 50 gwei: ~${formatEther(budget50gwei)} ${chain.nativeCurrency.symbol}`);
console.log(`     At current (${formatGwei(effectiveGasPrice)} gwei): ~${formatEther(actualCost * 3n)} ${chain.nativeCurrency.symbol}`);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveChain(chainId, rpcUrl) {
	const knownChains = Object.values(chains);
	const match = knownChains.find((c) => c.id === chainId);

	if (match) {
		return {
			...match,
			rpcUrls: { ...match.rpcUrls, default: { http: [rpcUrl] } },
		};
	}

	return {
		id: chainId,
		name: `Chain ${chainId}`,
		nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
		rpcUrls: { default: { http: [rpcUrl] } },
	};
}
