#!/usr/bin/env node

/**
 * Starts a persistent Hardhat node forking mainnet, deploys AnonZapRouter,
 * and prints the deployed addresses for external consumers (e.g. farm-widget).
 *
 * Usage: npm run fork:mainnet
 * Reads MAINNET_RPC_URL from .env
 */

import "dotenv/config";
import { spawn } from "node:child_process";
import { createPublicClient, createWalletClient, http, getAddress, defineChain } from "viem";

const hardhatFork = defineChain({
	id: 31337,
	name: "Hardhat Fork",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

const RPC_URL = "http://127.0.0.1:8545";
const FORK_RPC = process.env.MAINNET_RPC_URL;

if (!FORK_RPC) {
	console.error("❌ MAINNET_RPC_URL environment variable is required");
	process.exit(1);
}

console.log("🔄 Starting Hardhat node with mainnet fork...");

const node = spawn("npx", ["hardhat", "node", "--network", "mainnetFork"], {
	stdio: ["ignore", "pipe", "pipe"],
	cwd: process.cwd(),
});

let nodeOutput = "";

node.stdout.on("data", (data) => {
	const text = data.toString();
	nodeOutput += text;
	if (text.includes("Account #")) {
		process.stdout.write(text);
	}
});

node.stderr.on("data", (data) => {
	process.stderr.write(data);
});

node.on("error", (err) => {
	console.error("❌ Failed to start Hardhat node:", err.message);
	process.exit(1);
});

node.on("exit", (code) => {
	console.error(`❌ Hardhat node exited with code ${code}`);
	process.exit(code ?? 1);
});

process.on("SIGINT", () => {
	console.log("\n🛑 Shutting down fork...");
	node.kill("SIGTERM");
	process.exit(0);
});

process.on("SIGTERM", () => {
	node.kill("SIGTERM");
	process.exit(0);
});

await waitForNode();
const addresses = await deploy();

console.log("\n" + "═".repeat(60));
console.log("  🚀 Fork is ready!");
console.log("═".repeat(60));
console.log(`  RPC_URL          = ${RPC_URL}`);
console.log(`  ANON_ZAP_ROUTER  = ${addresses.router}`);
console.log(`  TOKEN_MANAGER    = ${addresses.tokenManager}`);
console.log(`  OWNER            = ${addresses.owner}`);
console.log("═".repeat(60));
console.log("\n  Fork is running. Press Ctrl+C to stop.\n");

async function waitForNode(timeoutMs = 30_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(RPC_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "eth_blockNumber",
					params: [],
					id: 1,
				}),
			});
			if (res.ok) {
				const json = await res.json();
				console.log(`✅ Node ready at block ${parseInt(json.result, 16)}`);
				return;
			}
		} catch {
			// not ready yet
		}
		await sleep(500);
	}
	console.error("❌ Timeout waiting for Hardhat node to start");
	node.kill("SIGTERM");
	process.exit(1);
}

async function deploy() {
	const publicClient = createPublicClient({
		chain: hardhatFork,
		transport: http(RPC_URL),
	});

	// Hardhat node provides pre-funded accounts; use account #0 as deployer
	const accounts = await publicClient.request({
		method: "eth_accounts",
	});
	const deployer = getAddress(accounts[0]);

	const walletClient = createWalletClient({
		account: deployer,
		chain: hardhatFork,
		transport: http(RPC_URL),
	});

	console.log(`\n🔨 Deploying AnonZapRouter (owner: ${deployer})...`);

	// Read compiled artifact
	const { default: routerArtifact } = await import(
		"../artifacts/contracts/AnonZapRouter.sol/AnonZapRouter.json",
		{ with: { type: "json" } }
	);

	// Deploy AnonZapRouter(owner)
	const deployHash = await walletClient.deployContract({
		abi: routerArtifact.abi,
		bytecode: routerArtifact.bytecode,
		args: [deployer],
	});

	const receipt = await publicClient.waitForTransactionReceipt({
		hash: deployHash,
	});

	const routerAddress = getAddress(receipt.contractAddress);
	console.log(`✅ AnonZapRouter deployed at: ${routerAddress}`);

	// Read tokenManager from router
	const tokenManagerAddress = await publicClient.readContract({
		address: routerAddress,
		abi: routerArtifact.abi,
		functionName: "tokenManager",
	});

	console.log(`✅ AnonTokenManager at: ${getAddress(tokenManagerAddress)}`);

	return {
		router: routerAddress,
		tokenManager: getAddress(tokenManagerAddress),
		owner: deployer,
	};
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
