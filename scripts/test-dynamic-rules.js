#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const rulesPath = path.resolve(rootDir, "content-dynamic-rules.js");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function loadDynamicRules() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(rulesPath, "utf8"), context, { filename: rulesPath });
  if (typeof context.window.ghruApplyDynamicRules !== "function") {
    fail("content-dynamic-rules.js did not expose window.ghruApplyDynamicRules");
  }
  return context.window.ghruApplyDynamicRules;
}

const translations = new Map([
  ["May", "май"],
  ["June", "июнь"]
]);
const translationsCI = new Map(
  Array.from(translations, ([key, value]) => [key.toLowerCase(), value])
);
const ctx = { norm, translations, translationsCI };
const applyDynamicRule = loadDynamicRules();

const cases = [
  ["No contributions on February 13th", "Нет вкладов 13 февраля"],
  ["1 contribution on February 13th", "1 вклад 13 февраля"],
  ["2 contributions on February 13th", "2 вклада 13 февраля"],
  ["5 contributions on February 13th", "5 вкладов 13 февраля"],
  [
    "Yowza, that's a big file. Try again with a file smaller than 25MB",
    "Ого, это большой файл. Попробуйте ещё раз с файлом меньше 25 МБ"
  ],
  ["15GB of Codespaces storage per developer", "15 ГБ хранилища Codespaces на разработчика"],
  ["500MB of Packages storage", "500 МБ хранилища Packages"],
  [
    "Images should be at least 320x320px (640x640px for best display)",
    "Изображения должны быть не меньше 320×320px (для лучшего отображения — 640×640px)"
  ],
  [
    "Images should be at least 320\u00d7320px (640\u00d7640px for best display)",
    "Изображения должны быть не меньше 320×320px (для лучшего отображения — 640×640px)"
  ],
  [
    "Please upload a picture smaller than 10,000x10,000",
    "Пожалуйста, загрузите изображение меньше 10,000×10,000"
  ],
  ["May 2026", "май 2026"],
  ["May 1 - June 2, 2026", "май 1 - июнь 2, 2026"],
  ["Contribution activity in 2026", "Активность за 2026 год"],
  ["1 day", "1 день"],
  ["2 days", "2 дня"],
  ["5 days", "5 дней"],
  ["In 1 minute", "Через 1 минуту"],
  ["In 2 minutes", "Через 2 минуты"]
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = applyDynamicRule(input, ctx);
  if (actual !== expected) {
    failed++;
    console.error(`FAILED: ${JSON.stringify(input)}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual:   ${JSON.stringify(actual)}`);
  }
}

const unmatched = applyDynamicRule("No contributions on Smarch 13th", ctx);
if (unmatched !== null) {
  failed++;
  console.error(`FAILED: unknown month should not match, got ${JSON.stringify(unmatched)}`);
}

if (failed) {
  fail(`dynamic rule fixtures failed: ${failed}`);
}

console.log(`OK: dynamic rule fixtures passed (${cases.length + 1})`);
