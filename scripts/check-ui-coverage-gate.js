#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const baselinePathArg = process.argv[3] || "coverage-baseline.json";
const thresholdArg = process.argv[4] || "90";
const minCorpusArg = process.argv[5] || "200";

const dictPath = path.resolve(process.cwd(), dictPathArg);
const baselinePath = path.resolve(process.cwd(), baselinePathArg);
const threshold = Number(thresholdArg);
const minCorpus = Number(minCorpusArg);

const sections = ["repo_home", "issues", "pr", "settings", "other"];

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

function norm(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

const dict = readJsonObject(dictPath, dictPathArg);
const baseline = readJsonObject(baselinePath, baselinePathArg);

const dictMap = new Map();
for (const [k, v] of Object.entries(dict)) {
  if (typeof k !== "string" || typeof v !== "string") continue;
  const key = norm(k);
  const val = norm(v);
  if (!key || !val) continue;
  dictMap.set(key, val);
}

const stats = {};
const missingSample = {};
let total = 0;
let translatedCount = 0;

for (const section of sections) {
  const list = Array.isArray(baseline[section]) ? baseline[section] : [];
  let secTotal = 0;
  let secTranslated = 0;
  const secMissing = [];

  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const key = norm(raw);
    if (!key) continue;

    secTotal += 1;
    total += 1;

    const candidates = [`[${section}] ${key}`, `${section}:${key}`, key];
    let found = false;
    for (const c of candidates) {
      if (dictMap.has(c)) {
        found = true;
        break;
      }
    }

    if (found) {
      secTranslated += 1;
      translatedCount += 1;
    } else {
      secMissing.push(key);
    }
  }

  const percent = secTotal ? Math.round((secTranslated / secTotal) * 100) : 100;
  stats[section] = { translatedCount: secTranslated, total: secTotal, percent };
  missingSample[section] = secMissing.slice(0, 30);
}

const totalPercent = total ? Math.round((translatedCount / total) * 100) : 0;

console.log(`COVERAGE_GATE: ${totalPercent}% (${translatedCount}/${total}) threshold=${threshold}%`);
for (const section of sections) {
  const row = stats[section];
  console.log(`${section}: ${row.percent}% (${row.translatedCount}/${row.total})`);
}

if (!Number.isFinite(minCorpus) || minCorpus < 1) {
  fail(`Некорректный min corpus: ${minCorpusArg}`);
}
if (total < minCorpus) {
  console.log("\nMISSING SAMPLE:");
  for (const section of sections) {
    console.log(`[${section}]`);
    const list = missingSample[section] || [];
    if (!list.length) console.log("- (empty)");
    for (const item of list.slice(0, 10)) console.log(`- ${item}`);
  }
  fail(`UI-корпус слишком маленький (${total}). Нужен минимум ${minCorpus}.`);
}

if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) {
  fail(`Некорректный threshold: ${thresholdArg}`);
}

if (totalPercent < threshold) {
  console.log("\nMISSING SAMPLE:");
  for (const section of sections) {
    console.log(`[${section}]`);
    const list = missingSample[section] || [];
    if (!list.length) console.log("- (empty)");
    for (const item of list.slice(0, 10)) console.log(`- ${item}`);
  }
  fail(`Покрытие UI ниже порога: ${totalPercent}% < ${threshold}%`);
}

console.log("OK: coverage gate passed");
