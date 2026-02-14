#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const outPathArg = process.argv[3] || "translation-audit-report.json";
const whitelistPathArg = process.argv[4] || "dict-sections/16-brand-tech-terms.json";

const dictPath = path.resolve(process.cwd(), dictPathArg);
const outPath = path.resolve(process.cwd(), outPathArg);
const whitelistPath = path.resolve(process.cwd(), whitelistPathArg);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(dictPath)) {
  fail(`Dictionary not found: ${dictPathArg}`);
}

const dict = JSON.parse(fs.readFileSync(dictPath, "utf8"));
if (!dict || typeof dict !== "object" || Array.isArray(dict)) {
  fail("Dictionary must be a JSON object");
}

let whitelist = {};
if (fs.existsSync(whitelistPath)) {
  const parsed = JSON.parse(fs.readFileSync(whitelistPath, "utf8"));
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    whitelist = parsed;
  }
}

const whitelistKeySet = new Set(
  Object.keys(whitelist)
    .filter((k) => typeof k === "string" && !k.trim().startsWith("//"))
    .map((k) => k.trim())
);

function samplePush(samples, row, max = 30) {
  if (samples.length < max) samples.push(row);
}

const rows = Object.entries(dict).filter(([k, v]) => typeof k === "string" && typeof v === "string");
const stats = {
  total: rows.length,
  whitelistTerms: whitelistKeySet.size,
  sameAsSourceRaw: 0,
  sameAsSourceNeedsReview: 0,
  latinHeavyRaw: 0,
  latinHeavyNeedsReview: 0,
  hasAsciiApostrophe: 0,
  hasPlaceholders: 0,
  longValueOver180: 0,
  mixedIssueTerms: 0
};

const samples = {
  sameAsSourceNeedsReview: [],
  latinHeavyNeedsReview: [],
  hasAsciiApostrophe: [],
  longValueOver180: [],
  mixedIssueTerms: []
};

for (const [k, v] of rows) {
  const key = k.trim();
  const val = v.trim();
  if (!key || !val) continue;

  const inWhitelist = whitelistKeySet.has(key);

  if (key.toLowerCase() === val.toLowerCase()) {
    stats.sameAsSourceRaw++;
    if (!inWhitelist) {
      stats.sameAsSourceNeedsReview++;
      samplePush(samples.sameAsSourceNeedsReview, { key, value: val });
    }
  }

  const letters = val.match(/[A-Za-z\u0400-\u04FF]/g) || [];
  const lat = val.match(/[A-Za-z]/g) || [];
  if (letters.length && lat.length / letters.length > 0.65) {
    stats.latinHeavyRaw++;
    if (!inWhitelist) {
      stats.latinHeavyNeedsReview++;
      samplePush(samples.latinHeavyNeedsReview, { key, value: val });
    }
  }

  if (val.includes("'")) {
    stats.hasAsciiApostrophe++;
    samplePush(samples.hasAsciiApostrophe, { key, value: val });
  }

  if (/\{N\}|\{YEAR\}|\{USERNAME\}|@USERNAME|\(USERNAME\)/.test(val)) {
    stats.hasPlaceholders++;
  }

  if (val.length > 180) {
    stats.longValueOver180++;
    samplePush(samples.longValueOver180, { key, value: val.slice(0, 220) });
  }

  const low = val.toLowerCase();
  if ((low.includes("issue") && low.includes("задач")) || (low.includes("issue") && low.includes("проблем"))) {
    stats.mixedIssueTerms++;
    samplePush(samples.mixedIssueTerms, { key, value: val });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  source: dictPathArg,
  whitelistSource: whitelistPathArg,
  stats,
  samples
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(`AUDIT_SOURCE: ${dictPathArg}`);
console.log(`AUDIT_REPORT: ${outPathArg}`);
console.log(`WHITELIST_SOURCE: ${whitelistPathArg}`);
console.log(`TOTAL: ${stats.total}`);
console.log(`sameAsSourceRaw: ${stats.sameAsSourceRaw}`);
console.log(`sameAsSourceNeedsReview: ${stats.sameAsSourceNeedsReview}`);
console.log(`latinHeavyRaw: ${stats.latinHeavyRaw}`);
console.log(`latinHeavyNeedsReview: ${stats.latinHeavyNeedsReview}`);
console.log(`hasAsciiApostrophe: ${stats.hasAsciiApostrophe}`);
console.log(`longValueOver180: ${stats.longValueOver180}`);
console.log(`mixedIssueTerms: ${stats.mixedIssueTerms}`);
console.log("OK: audit complete");
