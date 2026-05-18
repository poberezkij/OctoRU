#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const outPathArg = process.argv[3] || "dict-version.json";
const changelogPathArg = process.argv[4] || "dict-changelog.md";

const dictPath = path.resolve(process.cwd(), dictPathArg);
const outPath = path.resolve(process.cwd(), outPathArg);
const changelogPath = path.resolve(process.cwd(), changelogPathArg);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJsonObject(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fail(`Не удалось прочитать ${label}: ${e.message || String(e)}`);
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`Некорректный JSON в ${label}: ${e.message || String(e)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} должен быть JSON-объектом`);
  }
  return parsed;
}

const dict = readJsonObject(dictPath, dictPathArg);
const normalized = JSON.stringify(dict, Object.keys(dict).sort());
const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
const keys = Object.keys(dict).length;
const force = process.argv.includes("--force") || process.env.GHRU_DICT_VERSION_FORCE === "1";

function readExistingMeta() {
  if (!fs.existsSync(outPath)) return null;
  try {
    const raw = fs.readFileSync(outPath, "utf8");
    const parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

function hasValidCurrentMeta(meta) {
  return !!meta &&
    meta.keys === keys &&
    meta.hash === hash &&
    typeof meta.version === "string" &&
    typeof meta.builtAt === "string";
}

const existingMeta = readExistingMeta();
let meta = existingMeta;
let changed = force || !hasValidCurrentMeta(existingMeta);

if (changed) {
  const builtAt = new Date().toISOString();
  const version = `${builtAt.slice(0, 10)}-${keys}-${hash}`;
  meta = { version, keys, hash, builtAt };
  fs.writeFileSync(outPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  const line = `- ${builtAt} version=${version} keys=${keys} hash=${hash} source=${dictPathArg}\n`;
  if (!fs.existsSync(changelogPath)) {
    fs.writeFileSync(changelogPath, `# Dictionary Changelog\n\n${line}`, "utf8");
  } else {
    const existing = fs.readFileSync(changelogPath, "utf8");
    if (!existing.includes(`version=${version}`)) {
      fs.appendFileSync(changelogPath, line, "utf8");
    }
  }
}

console.log(`DICT VERSION: ${meta.version}`);
console.log(`META FILE: ${outPathArg}`);
console.log(`CHANGELOG: ${changelogPathArg}`);
console.log(changed ? "OK: dict version updated" : "OK: dict version unchanged");
