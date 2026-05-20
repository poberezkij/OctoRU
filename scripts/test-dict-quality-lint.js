#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.resolve(rootDir, "scripts", "dict-quality-lint.js");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runLint(cwd, dictName, baselineName) {
  return spawnSync(process.execPath, [scriptPath, dictName, baselineName], {
    cwd,
    encoding: "utf8",
    stdio: "pipe"
  });
}

function expectStatus(label, result, expectedStatus, expectedOutput) {
  if (result.status !== expectedStatus) {
    fail(`${label}: expected status ${expectedStatus}, got ${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (expectedOutput && !output.includes(expectedOutput)) {
    fail(`${label}: expected output to include ${JSON.stringify(expectedOutput)}\n${output}`);
  }
}

function runCase(label, dict, baseline, expectedStatus, expectedOutput) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octoru-dict-quality-"));
  try {
    writeJson(path.resolve(tempDir, "dict.json"), dict);
    writeJson(path.resolve(tempDir, "baseline.json"), baseline);
    const result = runLint(tempDir, "dict.json", "baseline.json");
    expectStatus(label, result, expectedStatus, expectedOutput);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const emptyBaseline = {
  maxSuspicious: {
    email: 0,
    owner_repo: 0,
    token: 0,
    long: 0
  }
};

runCase(
  "slash false-positive allowlist",
  {
    "For license-based products, the price/unit is a prorated portion of the monthly price": "Translation"
  },
  emptyBaseline,
  0,
  "QUALITY GATE: suspicious counts within baseline.json"
);

runCase(
  "owner/repo blocks",
  {
    "owner/repo": "Translation"
  },
  emptyBaseline,
  1,
  "owner_repo: 1/0"
);

runCase(
  "long key blocks",
  {
    ["A".repeat(181)]: "Translation"
  },
  emptyBaseline,
  1,
  "long: 1/0"
);

runCase(
  "long key baseline allows known debt",
  {
    ["A".repeat(181)]: "Translation"
  },
  {
    maxSuspicious: {
      email: 0,
      owner_repo: 0,
      token: 0,
      long: 1
    }
  },
  0,
  "QUALITY GATE: suspicious counts within baseline.json"
);

console.log("OK: dict quality lint fixtures passed");
