#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const outPathArg = process.argv[3] || "incoming-translations.cleaned.json";

const dictPath = path.resolve(process.cwd(), dictPathArg);
const outPath = path.resolve(process.cwd(), outPathArg);

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

function shouldDrop(key) {
  const t = String(key || "").trim();
  if (!t) return "empty";
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return "email";
  if (/^\S+$/.test(t) && /[+#*]/.test(t) && t.length < 40) return "language_token";
  if (/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(t)) return "owner_repo";
  if (/^.{181,}$/.test(t)) return "long";
  return "";
}

const source = readJsonObject(dictPath, dictPathArg);
const out = {};
const dropped = [];

for (const [k, v] of Object.entries(source)) {
  if (typeof k !== "string" || typeof v !== "string") continue;
  const kk = k.trim();
  const vv = v.trim();
  if (!kk || !vv) continue;

  const reason = shouldDrop(kk);
  if (reason) {
    dropped.push({ reason, key: kk });
    continue;
  }
  out[kk] = vv;
}

fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
console.log(`SOURCE: ${dictPathArg}`);
console.log(`OUTPUT: ${outPathArg}`);
console.log(`KEPT: ${Object.keys(out).length}`);
console.log(`DROPPED: ${dropped.length}`);
if (dropped.length) {
  for (const row of dropped.slice(0, 25)) {
    console.log(`- [${row.reason}] ${row.key}`);
  }
}
console.log("OK: cleanup finished");
