#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const basePathArg = process.argv[2] || "__empty__";
const overlaysDirArg = process.argv[3] || "dict-sections";
const outPathArg = process.argv[4] || "bundled-dictionary.json";

const cwd = process.cwd();
const basePath = basePathArg === "__empty__" ? null : path.resolve(cwd, basePathArg);
const overlaysDir = path.resolve(cwd, overlaysDirArg);
const outPath = path.resolve(cwd, outPathArg);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(msg);
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
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

  if (!isPlainObject(parsed)) {
    fail(`${label} must be a JSON object`);
  }

  const out = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof k !== "string" || typeof v !== "string") continue;
    const kk = k.trim();
    const vv = v.trim();
    if (!kk || !vv) continue;
    out[kk] = vv;
  }
  return out;
}

const merged = basePath ? readJsonObject(basePath, basePathArg) : {};
let overlayCount = 0;
let changedKeys = 0;

if (fs.existsSync(overlaysDir)) {
  const files = fs
    .readdirSync(overlaysDir)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    const full = path.join(overlaysDir, file);
    const overlay = readJsonObject(full, path.join(overlaysDirArg, file));
    overlayCount++;
    for (const [k, v] of Object.entries(overlay)) {
      if (merged[k] !== v) changedKeys++;
      merged[k] = v;
    }
  }
}

const payload = `${JSON.stringify(merged, null, 2)}\n`;
try {
  fs.writeFileSync(outPath, payload, "utf8");
} catch (e) {
  fail(`Failed to write output: ${e.message || String(e)}`);
}

info(`Base: ${basePathArg}`);
info(`Overlay directory: ${overlaysDirArg} (${overlayCount} file(s))`);
info(`Output: ${outPathArg}`);
info(`Total keys: ${Object.keys(merged).length}`);
info(`Overlay changed keys: ${changedKeys}`);
info("OK: bundled dictionary rebuilt");
