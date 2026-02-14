#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const dictPath = path.resolve(process.cwd(), dictPathArg);

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

function isCommentKey(key) {
  return typeof key === "string" && key.trim().startsWith("//");
}

function hasEmail(s) {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s);
}

function hasOwnerRepoWithContext(s) {
  if (!/\brepository\b/i.test(s)) return false;
  return /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(s);
}

function hasExplicitUserMention(s) {
  const matches = s.match(/@[A-Za-z0-9_.-]{2,}/g) || [];
  if (!matches.length) return false;
  for (const token of matches) {
    const lowered = token.toLowerCase();
    if (lowered === "@mention" || lowered === "@mentions" || lowered === "@mentioning" || lowered === "@username") continue;
    return true;
  }
  return false;
}

if (!fs.existsSync(dictPath)) {
  fail(`Dictionary file not found: ${dictPathArg}`);
}

let raw;
try {
  raw = fs.readFileSync(dictPath, "utf8");
} catch (e) {
  fail(`Failed to read file: ${e.message || String(e)}`);
}

let dict;
try {
  dict = JSON.parse(raw);
} catch (e) {
  fail(`Invalid JSON: ${e.message || String(e)}`);
}

if (!isPlainObject(dict)) {
  fail("Dictionary root must be a JSON object");
}

const violations = [];
for (const [k, v] of Object.entries(dict)) {
  if (isCommentKey(k)) continue;
  if (typeof k !== "string" || typeof v !== "string") continue;
  const key = k.trim();
  if (!key) continue;

  if (hasEmail(key)) {
    violations.push({ type: "email", key });
  }
  if (hasOwnerRepoWithContext(key)) {
    violations.push({ type: "owner_repo", key });
  }
  if (hasExplicitUserMention(key)) {
    violations.push({ type: "mention", key });
  }
}

if (violations.length) {
  for (const row of violations.slice(0, 50)) {
    console.error(`STRICT-LINT ${row.type}: "${row.key}"`);
  }
  if (violations.length > 50) {
    console.error(`...and ${violations.length - 50} more`);
  }
  fail(`Strict dictionary lint failed. Violations: ${violations.length}`);
}

info(`Checked file: ${dictPathArg}`);
info("OK: strict dictionary lint passed");
