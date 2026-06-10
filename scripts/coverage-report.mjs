#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const THRESHOLD = 100;
const lcovFile = process.env.LCOV_FILE || "coverage/lcov.info";
const reportOutputFile = process.env.REPORT_OUTPUT_FILE || "coverage-report.md";

function parseLcov(raw) {
  const files = [];
  let current = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("SF:")) {
      current = { file: line.slice(3), linesFound: 0, linesHit: 0 };
    } else if (line.startsWith("LF:") && current) {
      current.linesFound = parseInt(line.slice(3), 10);
    } else if (line.startsWith("LH:") && current) {
      current.linesHit = parseInt(line.slice(3), 10);
    } else if (line === "end_of_record" && current) {
      files.push(current);
      current = null;
    }
  }
  return files;
}

function coverageIcon(pct) {
  if (pct >= 100) return "🟢";
  if (pct >= 80) return "🟡";
  return "🔴";
}

function generateReport(files) {
  const totalFound = files.reduce((s, f) => s + f.linesFound, 0);
  const totalHit = files.reduce((s, f) => s + f.linesHit, 0);
  const totalPct = totalFound > 0 ? (totalHit / totalFound) * 100 : 100;
  const pass = totalPct >= THRESHOLD;

  const lines = [];
  lines.push("## 🛡️ CI Report (Coverage)\n");

  if (pass) {
    lines.push(`✅ **All files meet ${THRESHOLD}% line coverage threshold**\n`);
  } else {
    lines.push(`❌ **Coverage below threshold: ${totalPct.toFixed(1)}% < ${THRESHOLD}%**\n`);
  }

  lines.push("| File | Lines | Coverage |");
  lines.push("|------|-------|----------|");

  for (const f of files) {
    const pct = f.linesFound > 0 ? (f.linesHit / f.linesFound) * 100 : 100;
    const name = path.basename(f.file);
    lines.push(`| ${name} | ${f.linesHit}/${f.linesFound} | ${coverageIcon(pct)} ${pct.toFixed(1)}% |`);
  }

  lines.push(`| **Total** | **${totalHit}/${totalFound}** | **${totalPct.toFixed(1)}%** |`);
  lines.push("");

  return { report: lines.join("\n"), pass, totalPct };
}

try {
  const raw = readFileSync(lcovFile, "utf-8");
  const files = parseLcov(raw);
  const { report, pass, totalPct } = generateReport(files);

  writeFileSync(reportOutputFile, report);
  console.log(`✅ Report → ${reportOutputFile}`);
  console.log(`   Coverage: ${totalPct.toFixed(1)}% (threshold: ${THRESHOLD}%)`);

  if (!pass) {
    console.error(`❌ Coverage ${totalPct.toFixed(1)}% is below ${THRESHOLD}% threshold`);
    process.exit(1);
  }
} catch (err) {
  console.error("Failed to generate coverage report:", err.message);
  process.exit(1);
}
