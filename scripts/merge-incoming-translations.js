#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const sourcePathArg = process.argv[2] || "incoming-translations.json";
const targetPathArg = process.argv[3] || "dict-sections/13-repo-issues-pr.json";
const changelogPathArg = process.argv[4] || "dict-changelog.md";

const flags = new Set(process.argv.slice(5));
const shouldClearSource = flags.has("--clear-source");
const reportPathArg = flags.has("--report") ? process.argv[process.argv.indexOf("--report") + 1] : "last-import-report.json";

const sourcePath = path.resolve(process.cwd(), sourcePathArg);
const targetPath = path.resolve(process.cwd(), targetPathArg);
const changelogPath = path.resolve(process.cwd(), changelogPathArg);
const reportPath = path.resolve(process.cwd(), reportPathArg || "last-import-report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fail(`Не удалось прочитать ${label}: ${e.message || String(e)}`);
  }

  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  try {
    return JSON.parse(raw);
  } catch (e) {
    fail(`Некорректный JSON в ${label}: ${e.message || String(e)}`);
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeToken(s) {
  return String(s)
    .replace(/poberezkij/gi, "USERNAME")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "user@example.com")
    .replace(/@[A-Za-z0-9_.-]{2,}/g, "@USERNAME")
    .trim();
}

function classifySuspicious(key) {
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(key)) return "email";
  if (/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(key)) return "owner_repo";
  if (/^.{181,}$/.test(key)) return "long_key";
  if (/^\S+$/.test(key) && /[+#*]/.test(key) && key.length < 40) return "language_token";
  return "";
}

const source = readJson(sourcePath, sourcePathArg);
const target = readJson(targetPath, targetPathArg);

if (!source || typeof source !== "object" || Array.isArray(source)) {
  fail("Входной файл должен быть JSON-объектом вида { \"English\": \"Русский\" }");
}
if (!target || typeof target !== "object" || Array.isArray(target)) {
  fail("Целевой файл должен быть JSON-объектом");
}

let added = 0;
let updated = 0;
let skipped = 0;
const conflicts = [];
const suspicious = [];

for (const [kRaw, vRaw] of Object.entries(source)) {
  if (typeof kRaw !== "string" || typeof vRaw !== "string") {
    skipped += 1;
    continue;
  }

  const key = normalizeToken(kRaw);
  const value = normalizeToken(vRaw);
  if (!key || !value) {
    skipped += 1;
    continue;
  }

  const suspiciousType = classifySuspicious(key);
  if (suspiciousType) suspicious.push({ type: suspiciousType, key });

  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value;
    added += 1;
    continue;
  }

  if (target[key] !== value) {
    conflicts.push({ key, before: target[key], after: value });
    target[key] = value;
    updated += 1;
  }
}

writeJson(targetPath, target);

if (shouldClearSource) {
  writeJson(sourcePath, {});
}

const stamp = new Date().toISOString();
const report = {
  timestamp: stamp,
  source: sourcePathArg,
  target: targetPathArg,
  added,
  updated,
  skipped,
  conflicts,
  suspicious,
  targetTotalKeys: Object.keys(target).length,
  sourceCleared: shouldClearSource
};
writeJson(reportPath, report);

const changelogLine = `- ${stamp} source=${sourcePathArg} target=${targetPathArg} added=${added} updated=${updated} skipped=${skipped} conflicts=${conflicts.length} suspicious=${suspicious.length} clear_source=${shouldClearSource}\n`;
try {
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, `# Dictionary Changelog\n\n${changelogLine}`, "utf8");
  } else {
    fs.appendFileSync(changelogPath, changelogLine, "utf8");
  }
} catch (e) {
  console.warn(`WARN: Не удалось обновить changelog: ${e.message || String(e)}`);
}

console.log(`Source: ${sourcePathArg}`);
console.log(`Target: ${targetPathArg}`);
console.log(`Added: ${added}`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log(`Conflicts: ${conflicts.length}`);
console.log(`Suspicious: ${suspicious.length}`);
console.log(`Total keys: ${Object.keys(target).length}`);
console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
console.log(`Source cleared: ${shouldClearSource}`);

if (conflicts.length) {
  for (const row of conflicts.slice(0, 20)) {
    console.log(`CONFLICT: "${row.key}"`);
  }
}
if (suspicious.length) {
  for (const row of suspicious.slice(0, 20)) {
    console.log(`SUSPICIOUS ${row.type}: "${row.key}"`);
  }
}
