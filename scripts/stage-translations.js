#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const incomingArg = process.argv[2] || "incoming-translations.json";
const stagingArg = process.argv[3] || "staging-translations.json";

const incomingPath = path.resolve(process.cwd(), incomingArg);
const stagingPath = path.resolve(process.cwd(), stagingArg);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJsonObject(filePath, label, fallbackEmpty) {
  if (!fs.existsSync(filePath)) {
    if (fallbackEmpty) return {};
    fail(`Файл не найден: ${label}`);
  }

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

function normalizeToken(s) {
  return String(s)
    .replace(/poberezkij/gi, "USERNAME")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "user@example.com")
    .replace(/@[A-Za-z0-9_.-]{2,}/g, "@USERNAME")
    .trim();
}

const incoming = readJsonObject(incomingPath, incomingArg, false);
const staging = readJsonObject(stagingPath, stagingArg, true);

let added = 0;
let updated = 0;
let skipped = 0;

for (const [kRaw, vRaw] of Object.entries(incoming)) {
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

  if (!Object.prototype.hasOwnProperty.call(staging, key)) {
    staging[key] = value;
    added += 1;
    continue;
  }

  if (staging[key] !== value) {
    staging[key] = value;
    updated += 1;
  }
}

fs.writeFileSync(stagingPath, `${JSON.stringify(staging, null, 2)}\n`, "utf8");
console.log(`Incoming: ${incomingArg}`);
console.log(`Staging: ${stagingArg}`);
console.log(`Added: ${added}`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log(`Staging total: ${Object.keys(staging).length}`);
console.log("OK: staging updated");
