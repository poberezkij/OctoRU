#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(msg);
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

function writeJsonObject(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseSemver(v) {
  const m = String(v || "").trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function formatSemver(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpSemver(current, mode) {
  const next = { ...current };
  if (mode === "major") {
    next.major += 1;
    next.minor = 0;
    next.patch = 0;
    return next;
  }
  if (mode === "minor") {
    next.minor += 1;
    next.patch = 0;
    return next;
  }
  next.patch += 1;
  return next;
}

function resolveTargetVersion(currentVersion, arg) {
  const normalizedArg = String(arg || "patch").trim();
  if (normalizedArg === "major" || normalizedArg === "minor" || normalizedArg === "patch") {
    const currentParsed = parseSemver(currentVersion);
    if (!currentParsed) fail(`Current version is not semver: ${currentVersion}`);
    return formatSemver(bumpSemver(currentParsed, normalizedArg));
  }
  if (!parseSemver(normalizedArg)) {
    fail("Expected semver (e.g. 2.1.4) or bump keyword: major|minor|patch");
  }
  return normalizedArg;
}

function runNpm(args, cwd) {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) {
    execFileSync(process.execPath, [npmExecPath, ...args], { cwd, stdio: "inherit" });
    return;
  }
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npmCmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32"
  });
}

function ensureReleaseNotes(rootDir, version) {
  const notesPath = path.resolve(rootDir, `RELEASE_NOTES_v${version}.md`);
  if (fs.existsSync(notesPath)) return;
  const body = [
    `# OctoRU v${version}`,
    "",
    "## Что нового",
    "",
    "- TBD",
    "",
    "## Технически",
    "",
    `- Версия расширения: \`${version}\``,
    `- Версия npm-пакета: \`${version}\``,
    `- Релизный артефакт: \`dist/OctoRU-v${version}.zip\``,
    ""
  ].join("\n");
  fs.writeFileSync(notesPath, body, "utf8");
  info(`Created release notes: RELEASE_NOTES_v${version}.md`);
}

function main() {
  const rootDir = process.cwd();
  const versionArg = process.argv[2] || "patch";
  const runChecks = !process.argv.includes("--no-check");

  const packageJsonPath = path.resolve(rootDir, "package.json");
  const manifestPath = path.resolve(rootDir, "manifest.json");
  const pkg = readJsonObject(packageJsonPath, "package.json");
  const manifest = readJsonObject(manifestPath, "manifest.json");

  const packageVersion = String(pkg.version || "").trim();
  const manifestVersion = String(manifest.version || "").trim();
  if (!packageVersion || !manifestVersion) fail("Version is missing in package.json or manifest.json");
  if (packageVersion !== manifestVersion) {
    fail(`Version mismatch before prepare: package.json=${packageVersion} manifest.json=${manifestVersion}`);
  }

  const nextVersion = resolveTargetVersion(packageVersion, versionArg);
  if (nextVersion === packageVersion) {
    info(`Version is already ${nextVersion}. Nothing to bump.`);
  } else {
    pkg.version = nextVersion;
    manifest.version = nextVersion;
    writeJsonObject(packageJsonPath, pkg);
    writeJsonObject(manifestPath, manifest);
    info(`Version bumped: ${packageVersion} -> ${nextVersion}`);
  }

  ensureReleaseNotes(rootDir, nextVersion);

  if (!runChecks) {
    info("Skipped checks (--no-check)");
    return;
  }

  info("Running release checks...");
  runNpm(["run", "release:check"], rootDir);
  info("Building release archive...");
  runNpm(["run", "release:zip"], rootDir);
  info(`OK: release prepared for v${nextVersion}`);
}

main();
