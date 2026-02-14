#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dirArg = process.argv[2] || "dict-sections";
const writeMode = process.argv.includes("--write");

const dir = path.resolve(process.cwd(), dirArg);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
  fail(`Directory not found: ${dirArg}`);
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
if (!files.length) {
  fail(`No JSON files in: ${dirArg}`);
}

const rules = [
  [/Pull request’ы/g, "Пул-реквесты"],
  [/Pull request’ов/g, "Пул-реквестов"],
  [/Pull request’ам/g, "Пул-реквестам"],
  [/Pull request’ах/g, "Пул-реквестах"],
  [/Pull request’ом/g, "Пул-реквестом"],
  [/Pull request’/g, "Пул-реквест "],
  [/pull request’ы/g, "пул-реквесты"],
  [/pull request’ов/g, "пул-реквестов"],
  [/pull request’ам/g, "пул-реквестам"],
  [/pull request’ах/g, "пул-реквестах"],
  [/pull request’ом/g, "пул-реквестом"],
  [/pull request’а/g, "пул-реквеста"],
  [/pull request’/g, "пул-реквест "],
  [/pull requests/g, "пул-реквесты"],
  [/pull request/g, "пул-реквест"],
  [/check run'ам/g, "проверкам запусков"],
  [/status check'ов/g, "проверок статуса"],
  [/Push'и/g, "Пуши"],
  [/push'и/g, "пуши"],
  [/push'ей/g, "пушей"],
  [/push'ах/g, "пушах"],
  [/push'ем/g, "пушем"],
  [/Runner'ы/g, "Раннеры"],
  [/runner'ы/g, "раннеры"],
  [/runner'ов/g, "раннеров"],
  [/runner'ах/g, "раннерах"],
  [/runner'е/g, "раннере"],
  [/runner'а/g, "раннера"],
  [/prebuild'ы/g, "предсборки"],
  [/wildcard'ы/g, "wildcard-шаблоны"],
  [/задачами \(issues\)/g, "задачами"],
  [/проблем \(issues\)/g, "задач"],
  [/Issues добавляют/g, "Задачи добавляют"],
  [/\bworkflows\b/gi, "воркфлоу"],
  [/\bworkflow\b/gi, "воркфлоу"],
  [/\bdependency graph\b/gi, "граф зависимостей"],
  [/’/g, "'"]
];

function normalizeValue(value) {
  let next = value;
  for (const [pattern, replacement] of rules) {
    next = next.replace(pattern, replacement);
  }
  next = next.replace(/\s{2,}/g, " ");
  return next.trim();
}

let totalChanged = 0;
const changedByFile = [];

for (const file of files) {
  const full = path.join(dir, file);
  const raw = fs.readFileSync(full, "utf8");
  const json = JSON.parse(raw);
  let fileChanged = 0;

  for (const [k, v] of Object.entries(json)) {
    if (typeof v !== "string") continue;
    const next = normalizeValue(v);
    if (next !== v) {
      json[k] = next;
      fileChanged++;
      totalChanged++;
    }
  }

  if (fileChanged > 0) {
    changedByFile.push({ file, changed: fileChanged });
    if (writeMode) {
      fs.writeFileSync(full, `${JSON.stringify(json, null, 2)}\n`, "utf8");
    }
  }
}

console.log(`FILES: ${files.length}`);
console.log(`CHANGED_ENTRIES: ${totalChanged}`);
for (const row of changedByFile) {
  console.log(`- ${row.file}: ${row.changed}`);
}
console.log(writeMode ? "OK: changes written" : "OK: dry run");
