#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "content-dynamic-rules.js",
  "default-translations.js",
  "options.html",
  "options.js",
  "popup.html",
  "popup.js",
  "bundled-dictionary.json",
  "icon48.png",
  "icon128.png"
];

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

function ensureFilesExist(rootDir, files) {
  const missing = files.filter((file) => !fs.existsSync(path.resolve(rootDir, file)));
  if (missing.length) {
    fail(`Missing files for release zip: ${missing.join(", ")}`);
  }
}

function escapePsSingleQuoted(s) {
  return s.replace(/'/g, "''");
}

const rootDir = process.cwd();
const pkg = readJsonObject(path.resolve(rootDir, "package.json"), "package.json");
const manifest = readJsonObject(path.resolve(rootDir, "manifest.json"), "manifest.json");

const pkgVersion = typeof pkg.version === "string" ? pkg.version.trim() : "";
const manifestVersion = typeof manifest.version === "string" ? manifest.version.trim() : "";

if (!pkgVersion) fail("package.json version is missing or invalid");
if (!manifestVersion) fail("manifest.json version is missing or invalid");
if (pkgVersion !== manifestVersion) {
  fail(`Version mismatch: package.json=${pkgVersion} manifest.json=${manifestVersion}`);
}

ensureFilesExist(rootDir, FILES);

const distDir = path.resolve(rootDir, "dist");
const zipPath = path.resolve(distDir, `OctoRU-v${pkgVersion}.zip`);
fs.mkdirSync(distDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

if (process.platform === "win32") {
  const filesPs = FILES.map((f) => `'${escapePsSingleQuoted(f)}'`).join(",");
  const zipPathPs = escapePsSingleQuoted(zipPath);
  const psCommand = [
    `$files = @(${filesPs})`,
    `Compress-Archive -Path $files -DestinationPath '${zipPathPs}' -Force`
  ].join("; ");

  try {
    execFileSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCommand],
      { cwd: rootDir, stdio: "inherit" }
    );
  } catch (e) {
    fail(`Failed to build zip with PowerShell: ${e.message || String(e)}`);
  }
} else {
  try {
    execFileSync("zip", ["-q", "-r", zipPath, ...FILES], { cwd: rootDir, stdio: "inherit" });
  } catch (e) {
    fail(`Failed to build zip with zip CLI: ${e.message || String(e)}`);
  }
}

console.log(`OK: release archive created at ${path.relative(rootDir, zipPath)}`);
