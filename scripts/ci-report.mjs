#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const EIP170_LIMIT = 24_576;

const testOutputFile = process.env.TEST_OUTPUT_FILE || "test-output.txt";
const gasReportFile = process.env.GAS_REPORT_FILE || "gas-report.json";
const compileOutputFile = process.env.COMPILE_OUTPUT_FILE || "compile-output.txt";
const reportOutputFile = process.env.REPORT_OUTPUT_FILE || "ci-report.md";

function parseTestOutput(raw) {
  let passed = 0, failed = 0, skipped = 0, duration = "";
  let totalMs = 0;
  for (const line of raw.split("\n")) {
    const sm = /(\d+)\s+passing\s+\(([^)]+)\)/.exec(line);
    if (sm) { passed = +sm[1]; duration = sm[2]; }
    const fm = /(\d+)\s+failing/.exec(line);
    if (fm) failed = +fm[1];
    const skm = /(\d+)\s+(?:pending|skipped)/.exec(line);
    if (skm) skipped = +skm[1];
    const tm = /\((\d+)ms\)/.exec(line);
    if (tm) totalMs += +tm[1];
  }
  if (totalMs > 0) {
    duration = totalMs > 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`;
  }
  return { passed, failed, skipped, duration };
}

function parseGasReport(raw) {
  const data = JSON.parse(raw);
  const contracts = [];
  for (const [, val] of Object.entries(data.contracts)) {
    if (val.sourceName.includes("/mocks/")) continue;

    const functions = [];
    for (const [name, s] of Object.entries(val.functions || {})) {
      functions.push({ name, min: s.min, avg: s.avg, median: s.median, max: s.max, calls: s.count });
    }
    contracts.push({
      name: val.contractName,
      source: val.sourceName,
      functions,
      deployment: val.deployment,
      runtimeSize: val.deployment?.runtimeSize ?? null,
    });
  }
  return contracts;
}

function parseCompileOutput(raw) {
  return raw.split("\n").filter(l => /warning/i.test(l) && !/npm warn/i.test(l)).map(l => l.trim());
}

function sizeBar(bytes) {
  const pct = Math.min((bytes / EIP170_LIMIT) * 100, 100);
  if (pct < 50) return `🟢 ${pct.toFixed(1)}%`;
  if (pct < 80) return `🟡 ${pct.toFixed(1)}%`;
  return `🔴 ${pct.toFixed(1)}%`;
}

function fmt(n) { return n.toLocaleString("en-US"); }

function generateReport(test, contracts, warnings) {
  const lines = [];
  lines.push("## 📊 CI Report\n");

  // Test Results
  const status = test.failed > 0 ? "❌ FAILED" : "✅ PASSED";
  lines.push("### 🧪 Test Results\n");
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Status | ${status} |`);
  lines.push(`| Passed | **${test.passed}** |`);
  lines.push(`| Failed | **${test.failed}** |`);
  lines.push(`| Skipped | ${test.skipped} |`);
  lines.push(`| Duration | ${test.duration} |`);
  lines.push("");

  // Contract Sizes
  const sized = contracts.filter(c => c.runtimeSize !== null);
  if (sized.length > 0) {
    lines.push("### 📏 Contract Sizes (EIP-170: 24KB limit)\n");
    lines.push("| Contract | Size | KB | Usage |");
    lines.push("|----------|------|----|-------|");
    for (const c of sized) {
      const kb = (c.runtimeSize / 1024).toFixed(2);
      lines.push(`| ${c.name} | ${fmt(c.runtimeSize)} bytes | ${kb} | ${sizeBar(c.runtimeSize)} |`);
    }
    const over = sized.filter(c => c.runtimeSize > EIP170_LIMIT);
    if (over.length > 0) {
      lines.push(`\n> ⚠️ **${over.length} contract(s) exceed the 24KB EIP-170 limit!**\n`);
    }
    lines.push("");
  }

  // Gas Report
  const withFns = contracts.filter(c => c.functions.length > 0);
  if (withFns.length > 0) {
    lines.push("### ⛽ Gas Report\n");
    for (const c of withFns) {
      lines.push(`<details><summary><b>${c.name}</b>${c.deployment ? ` — deploy: ${fmt(c.deployment.avg)} gas` : ""}</summary>\n`);
      lines.push("| Function | Min | Avg | Median | Max | Calls |");
      lines.push("|----------|-----|-----|--------|-----|-------|");
      for (const fn of c.functions) {
        lines.push(`| \`${fn.name}\` | ${fmt(fn.min)} | ${fmt(fn.avg)} | ${fmt(fn.median)} | ${fmt(fn.max)} | ${fn.calls} |`);
      }
      lines.push("\n</details>\n");
    }
  }

  // Compilation
  lines.push("### 🔨 Compilation\n");
  if (warnings.length === 0) {
    lines.push("✅ No warnings\n");
  } else {
    lines.push(`⚠️ **${warnings.length} warning(s)**:\n`);
    lines.push("```");
    warnings.forEach(w => lines.push(w));
    lines.push("```\n");
  }

  return lines.join("\n");
}

try {
  const test = parseTestOutput(readFileSync(testOutputFile, "utf-8"));
  const contracts = parseGasReport(readFileSync(gasReportFile, "utf-8"));
  const warnings = parseCompileOutput(readFileSync(compileOutputFile, "utf-8"));

  const report = generateReport(test, contracts, warnings);
  writeFileSync(reportOutputFile, report);

  console.log(`✅ Report → ${reportOutputFile}`);
  console.log(`   Tests: ${test.passed} passed, ${test.failed} failed, ${test.skipped} skipped (${test.duration})`);

  const over = contracts.filter(c => c.runtimeSize !== null && c.runtimeSize > EIP170_LIMIT);
  if (over.length > 0) {
    console.error(`❌ ${over.length} contract(s) exceed EIP-170 limit!`);
    process.exit(1);
  }
} catch (err) {
  console.error("Failed to generate report:", err.message);
  process.exit(1);
}
