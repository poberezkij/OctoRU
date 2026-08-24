#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const releaseZipScript = path.resolve(rootDir, "scripts", "release-zip.js");

const EXPECTED_FILES = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, "release-files.json"), "utf8")
);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJsonObject(filePath, label) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} must be a JSON object`);
  }
  return parsed;
}

function normalizeZipName(name) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

function readZipEntryNames(zipPath) {
  const bytes = fs.readFileSync(zipPath);
  const eocdSig = 0x06054b50;
  const centralDirSig = 0x02014b50;
  const minEocdOffset = Math.max(0, bytes.length - 22 - 0xffff);

  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= minEocdOffset; i--) {
    if (bytes.readUInt32LE(i) === eocdSig) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) fail(`Could not find ZIP end-of-central-directory record in ${zipPath}`);

  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirSize = bytes.readUInt32LE(eocdOffset + 12);
  const centralDirOffset = bytes.readUInt32LE(eocdOffset + 16);
  if (centralDirOffset + centralDirSize > bytes.length) {
    fail(`Invalid ZIP central directory bounds in ${zipPath}`);
  }

  const names = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (bytes.readUInt32LE(offset) !== centralDirSig) {
      fail(`Invalid ZIP central directory header at offset ${offset}`);
    }
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    names.push(normalizeZipName(bytes.toString("utf8", nameStart, nameEnd)));
    offset = nameEnd + extraLength + commentLength;
  }
  return names;
}

function assertSameSet(actual, expected) {
  const actualSorted = Array.from(new Set(actual)).sort();
  const expectedSorted = Array.from(new Set(expected)).sort();
  const missing = expectedSorted.filter((file) => !actualSorted.includes(file));
  const extra = actualSorted.filter((file) => !expectedSorted.includes(file));
  if (missing.length || extra.length || actual.length !== actualSorted.length) {
    if (missing.length) console.error(`Missing from release zip: ${missing.join(", ")}`);
    if (extra.length) console.error(`Unexpected in release zip: ${extra.join(", ")}`);
    if (actual.length !== actualSorted.length) console.error("Release zip contains duplicate entries");
    fail("release zip contents do not match the expected allowlist");
  }
}

const pkg = readJsonObject(path.resolve(rootDir, "package.json"), "package.json");
const version = String(pkg.version || "").trim();
if (!version) fail("package.json version is missing");

execFileSync(process.execPath, [releaseZipScript], { cwd: rootDir, stdio: "pipe" });

const zipPath = path.resolve(rootDir, "dist", `OctoRU-v${version}.zip`);
if (!fs.existsSync(zipPath)) fail(`Release zip was not created: ${path.relative(rootDir, zipPath)}`);

const names = readZipEntryNames(zipPath);
assertSameSet(names, EXPECTED_FILES);

console.log(`OK: release zip contains expected files only (${names.length})`);
