#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.resolve(rootDir, "scripts", "update-dict-version.js");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readFile(filePath));
}

function runUpdate(cwd) {
  execFileSync(process.execPath, [
    scriptPath,
    "bundled-dictionary.json",
    "dict-version.json",
    "dict-changelog.md"
  ], { cwd, stdio: "pipe" });
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "octoru-dict-version-"));

try {
  const dictPath = path.resolve(tempDir, "bundled-dictionary.json");
  const metaPath = path.resolve(tempDir, "dict-version.json");
  const changelogPath = path.resolve(tempDir, "dict-changelog.md");

  fs.writeFileSync(dictPath, `${JSON.stringify({ Hello: "Привет" }, null, 2)}\n`, "utf8");

  runUpdate(tempDir);
  const firstMetaText = readFile(metaPath);
  const firstChangelogText = readFile(changelogPath);
  const firstMeta = readJson(metaPath);

  runUpdate(tempDir);
  const secondMetaText = readFile(metaPath);
  const secondChangelogText = readFile(changelogPath);
  const secondMeta = readJson(metaPath);

  if (secondMetaText !== firstMetaText) {
    fail("dict-version.json changed on an identical dictionary rebuild");
  }
  if (secondChangelogText !== firstChangelogText) {
    fail("dict-changelog.md changed on an identical dictionary rebuild");
  }
  if (secondMeta.hash !== firstMeta.hash || secondMeta.keys !== firstMeta.keys) {
    fail("dictionary metadata changed without dictionary content changes");
  }

  fs.writeFileSync(
    dictPath,
    `${JSON.stringify({ Hello: "Привет", Settings: "Настройки" }, null, 2)}\n`,
    "utf8"
  );
  runUpdate(tempDir);

  const thirdMeta = readJson(metaPath);
  const thirdChangelogText = readFile(changelogPath);
  if (thirdMeta.hash === firstMeta.hash || thirdMeta.keys === firstMeta.keys) {
    fail("dictionary metadata did not change after dictionary content changed");
  }
  const changelogEntries = thirdChangelogText
    .split(/\r?\n/)
    .filter((line) => line.startsWith("- "));
  if (changelogEntries.length !== 2) {
    fail(`expected exactly 2 changelog entries, got ${changelogEntries.length}`);
  }

  console.log("OK: dict version updates are idempotent");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
