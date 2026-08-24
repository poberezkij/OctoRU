#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "../content-dynamic-rules.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context, { filename: "content-dynamic-rules.js" });

const apply = context.window.ghruApplyDynamicRules;
const ruleContext = {
  norm: (value) => String(value).trim().replace(/\s+/g, " "),
  translations: new Map(),
  translationsCI: new Map()
};

const cases = [
  ["2/3 complete", "Выполнено 2 из 3"],
  ["Read · Est. 1m", "Читать · Примерно 1 минута"],
  ["Read · Est. 2m", "Читать · Примерно 2 минуты"],
  ["Read · Est. 6m", "Читать · Примерно 6 минут"]
];

for (const [input, expected] of cases) {
  const actual = apply(input, ruleContext);
  if (actual !== expected) {
    throw new Error(`${JSON.stringify(input)}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log(`Dynamic rule tests passed: ${cases.length}`);
