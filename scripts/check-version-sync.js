#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJsonObject(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fail(`Failed to read ${label}: ${e.message || String(e)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`Invalid JSON in ${label}: ${e.message || String(e)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} must be a JSON object`);
  }
  return parsed;
}

const root = process.cwd();
const packageJsonPath = path.resolve(root, "package.json");
const manifestPath = path.resolve(root, "manifest.json");

const pkg = readJsonObject(packageJsonPath, "package.json");
const manifest = readJsonObject(manifestPath, "manifest.json");

const pkgVersion = typeof pkg.version === "string" ? pkg.version.trim() : "";
const manifestVersion = typeof manifest.version === "string" ? manifest.version.trim() : "";

if (!pkgVersion) fail("package.json version is missing or invalid");
if (!manifestVersion) fail("manifest.json version is missing or invalid");

if (pkgVersion !== manifestVersion) {
  fail(`Version mismatch: package.json=${pkgVersion} manifest.json=${manifestVersion}`);
}

console.log(`OK: version sync package.json=manifest.json=${pkgVersion}`);
