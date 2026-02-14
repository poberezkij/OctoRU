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

function warn(msg) {
  console.warn(`WARN: ${msg}`);
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

function looksLikeISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function looksLikeISODateTime(s) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s);
}

function looksLikeRepoToken(s) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s);
}

function containsEmail(s) {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s);
}

function containsExplicitUserMention(s) {
  const matches = s.match(/@[A-Za-z0-9_.-]{2,}/g) || [];
  for (const token of matches) {
    const lowered = token.toLowerCase();
    if (lowered === "@mention" || lowered === "@mentions" || lowered === "@mentioning" || lowered === "@username") continue;
    return true;
  }
  return false;
}

function containsOwnerRepoFragment(s) {
  if (!/\brepository\b/i.test(s)) return false;
  return /\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(s);
}

function looksLikeHash(s) {
  return /^[0-9a-f]{40}$/i.test(s);
}

function containsYearToken(s) {
  return /(^|\D)(19|20)\d{2}(\D|$)/.test(s);
}

function containsAnyDigit(s) {
  return /\d/.test(s);
}

function containsGMTOffset(s) {
  return /\(\s*GMT\s*[+-]\d{2}:\d{2}\s*\)/i.test(s);
}

function looksLikeMonthDayKey(s) {
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}$/i.test(s.trim());
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
  fail("Dictionary root must be a JSON object { \"English\": \"Русский\" }");
}

const entries = Object.entries(dict);
if (!entries.length) {
  fail("Dictionary is empty");
}

let errorCount = 0;
let realEntriesCount = 0;
const warnings = [];
const emptyPairs = [];
const nonStringPairs = [];
const yearBoundKeys = [];
const monthDayKeys = [];
const numericKeys = [];
const gmtKeys = [];
const lowercaseMap = new Map();
const lowercaseConflicts = [];

for (const [k, v] of entries) {
  if (isCommentKey(k)) {
    if (typeof v !== "string" || v.trim() !== "") {
      warnings.push(`Comment key should have empty string value: "${k}"`);
    }
    continue;
  }

  if (typeof k !== "string" || typeof v !== "string") {
    nonStringPairs.push([k, v]);
    continue;
  }

  const kk = k.trim();
  const vv = v.trim();
  if (!kk || !vv) {
    emptyPairs.push([k, v]);
    continue;
  }

  realEntriesCount++;

  const lk = kk.toLowerCase();
  if (lowercaseMap.has(lk)) {
    const first = lowercaseMap.get(lk);
    if (first.key !== kk || first.value !== vv) {
      lowercaseConflicts.push({
        lowered: lk,
        first,
        second: { key: kk, value: vv }
      });
    }
  } else {
    lowercaseMap.set(lk, { key: kk, value: vv });
  }

  if (looksLikeISODate(kk) || looksLikeISODateTime(kk)) {
    warnings.push(`Suspicious date-like key: "${kk}"`);
  }
  if (containsYearToken(kk)) {
    yearBoundKeys.push(kk);
  }
  if (containsAnyDigit(kk)) {
    numericKeys.push(kk);
  }
  if (containsGMTOffset(kk)) {
    gmtKeys.push(kk);
  }
  if (looksLikeMonthDayKey(kk)) {
    monthDayKeys.push(kk);
  }
  if (looksLikeRepoToken(kk)) {
    warnings.push(`Suspicious user/repo-like key: "${kk}"`);
  }
  if (containsOwnerRepoFragment(kk)) {
    warnings.push(`Suspicious embedded owner/repo in key: "${kk}"`);
  }
  if (containsEmail(kk)) {
    warnings.push(`Suspicious email in key: "${kk}"`);
  }
  if (containsExplicitUserMention(kk)) {
    warnings.push(`Suspicious explicit user mention in key: "${kk}"`);
  }
  if (looksLikeHash(kk)) {
    warnings.push(`Suspicious SHA-like key: "${kk}"`);
  }
  if (kk.length > 120) {
    warnings.push(`Very long key (${kk.length}): "${kk.slice(0, 80)}..."`);
  }
}

if (nonStringPairs.length) {
  errorCount += nonStringPairs.length;
  for (const [k, v] of nonStringPairs.slice(0, 20)) {
    warn(`Non-string pair found: key=${JSON.stringify(k)} value=${JSON.stringify(v)}`);
  }
  if (nonStringPairs.length > 20) {
    warn(`...and ${nonStringPairs.length - 20} more non-string pairs`);
  }
}

if (emptyPairs.length) {
  errorCount += emptyPairs.length;
  for (const [k, v] of emptyPairs.slice(0, 20)) {
    warn(`Empty key/value after trim: key=${JSON.stringify(k)} value=${JSON.stringify(v)}`);
  }
  if (emptyPairs.length > 20) {
    warn(`...and ${emptyPairs.length - 20} more empty pairs`);
  }
}

if (lowercaseConflicts.length) {
  errorCount += lowercaseConflicts.length;
  for (const c of lowercaseConflicts.slice(0, 20)) {
    warn(
      `Lowercase conflict "${c.lowered}": ` +
      `"${c.first.key}" => "${c.first.value}" vs "${c.second.key}" => "${c.second.value}"`
    );
  }
  if (lowercaseConflicts.length > 20) {
    warn(`...and ${lowercaseConflicts.length - 20} more lowercase conflicts`);
  }
}

if (yearBoundKeys.length) {
  for (const k of yearBoundKeys.slice(0, 20)) {
    warn(`Year-bound key should not be in dictionary: "${k}"`);
  }
  if (yearBoundKeys.length > 20) {
    warn(`...and ${yearBoundKeys.length - 20} more year-bound keys`);
  }
  warn("Use dynamic rules in content.js for date/year patterns instead of static keys.");
}

if (monthDayKeys.length) {
  for (const k of monthDayKeys.slice(0, 20)) {
    warn(`Month-day key should not be in dictionary: "${k}"`);
  }
  if (monthDayKeys.length > 20) {
    warn(`...and ${monthDayKeys.length - 20} more month-day keys`);
  }
  warn("Use dynamic rules in content.js for month/day patterns instead of static keys.");
}

if (numericKeys.length) {
  for (const k of numericKeys.slice(0, 20)) {
    warn(`Numeric key should not be in dictionary: "${k}"`);
  }
  if (numericKeys.length > 20) {
    warn(`...and ${numericKeys.length - 20} more numeric keys`);
  }
  warn("Keep dictionary keys as plain English text without digits; use dynamic rules in content.js.");
}

if (gmtKeys.length) {
  for (const k of gmtKeys.slice(0, 20)) {
    warn(`GMT key should not be in dictionary: "${k}"`);
  }
  if (gmtKeys.length > 20) {
    warn(`...and ${gmtKeys.length - 20} more GMT keys`);
  }
  warn("Do not localize GMT-offset labels via dictionary.");
}

const uniqueWarnings = Array.from(new Set(warnings));
for (const w of uniqueWarnings.slice(0, 30)) {
  warn(w);
}
if (uniqueWarnings.length > 30) {
  warn(`...and ${uniqueWarnings.length - 30} more warnings`);
}

info(`Checked file: ${dictPathArg}`);
info(`Total entries (including comments): ${entries.length}`);
info(`Real dictionary entries: ${realEntriesCount}`);
info(`Lowercase-unique keys: ${lowercaseMap.size}`);
info(`Warnings: ${uniqueWarnings.length}`);

if (errorCount > 0) {
  fail(`Dictionary check failed. Errors: ${errorCount}`);
}

info("OK: dictionary check passed");
