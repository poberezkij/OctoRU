#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const dictPathArg = process.argv[2] || "bundled-dictionary.json";
const dictPath = path.resolve(process.cwd(), dictPathArg);
const baselinePathArg = process.argv[3] || "";
const baselinePath = baselinePathArg ? path.resolve(process.cwd(), baselinePathArg) : "";

const SUSPICIOUS_TYPES = ["email", "owner_repo", "token", "long"];
const SLASH_FALSE_POSITIVES = new Set([
  "and/or",
  "day/night",
  "input/output",
  "price/unit",
  "read/write"
]);

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

function isCommentKey(key) {
  return typeof key === "string" && key.trim().startsWith("//");
}

function classify(sectionScores) {
  let best = "other";
  let bestScore = -1;
  for (const [section, score] of Object.entries(sectionScores)) {
    if (score > bestScore) {
      bestScore = score;
      best = section;
    }
  }
  return best;
}

function toSection(key) {
  const t = String(key || "").toLowerCase();
  const score = { repo_home: 0, issues: 0, pr: 0, settings: 0, other: 0 };

  if (/\b(issue|label|milestone|assignee|author|new issue|filter issues|semantic search)\b/.test(t)) score.issues += 3;
  if (/\b(pull request|merge|rebase|squash|review|checks|head branch|base branch)\b/.test(t)) score.pr += 3;
  if (/\b(settings|security|webhooks|secrets|variables|rulesets|actions permissions|dependabot|code scanning|branch protection)\b/.test(t)) score.settings += 3;
  if (/\b(home|feed|quick setup|repository navigation|pin this repository|create repository)\b/.test(t)) score.repo_home += 3;

  if (/\b(repository|repositories|star|fork|watch|collaborators)\b/.test(t)) {
    score.repo_home += 1;
    score.other += 1;
  }

  return classify(score);
}

function looksSuspicious(key) {
  const t = String(key || "");
  if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return "email";
  const ownerRepoMatch = t.match(/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/);
  if (ownerRepoMatch && !SLASH_FALSE_POSITIVES.has(ownerRepoMatch[0].toLowerCase())) return "owner_repo";
  if (/^.{181,}$/.test(t)) return "long";
  if (/^\S+$/.test(t) && /[+#*]/.test(t)) return "token";
  return "";
}

function readQualityBaseline(filePath) {
  if (!filePath) return null;
  const baseline = readJsonObject(filePath, baselinePathArg);
  const maxSuspicious = baseline.maxSuspicious || {};
  const normalized = {};
  for (const type of SUSPICIOUS_TYPES) {
    const raw = maxSuspicious[type] == null ? 0 : maxSuspicious[type];
    if (!Number.isInteger(raw) || raw < 0) {
      fail(`${baselinePathArg}: maxSuspicious.${type} must be a non-negative integer`);
    }
    normalized[type] = raw;
  }
  return { maxSuspicious: normalized };
}

const dict = readJsonObject(dictPath, dictPathArg);
const baseline = readQualityBaseline(baselinePath);
const rows = [];
for (const [key, value] of Object.entries(dict)) {
  if (isCommentKey(key)) continue;
  if (typeof key !== "string" || typeof value !== "string") continue;
  const kk = key.trim();
  const vv = value.trim();
  if (!kk || !vv) continue;

  const section = toSection(kk);
  const suspicious = looksSuspicious(kk);
  rows.push({ key: kk, value: vv, section, suspicious });
}

const counts = { repo_home: 0, issues: 0, pr: 0, settings: 0, other: 0 };
const suspiciousCounts = { email: 0, owner_repo: 0, token: 0, long: 0 };
let suspiciousCount = 0;
for (const row of rows) {
  counts[row.section] += 1;
  if (row.suspicious) {
    suspiciousCount += 1;
    suspiciousCounts[row.suspicious] += 1;
  }
}

console.log(`QUALITY SUMMARY: total=${rows.length} suspicious=${suspiciousCount}`);
for (const section of ["repo_home", "issues", "pr", "settings", "other"]) {
  console.log(`${section}: ${counts[section]}`);
}

console.log(
  `suspicious by type: ${SUSPICIOUS_TYPES.map((type) => `${type}=${suspiciousCounts[type]}`).join(", ")}`
);

if (baseline) {
  const failures = [];
  for (const type of SUSPICIOUS_TYPES) {
    const actual = suspiciousCounts[type];
    const max = baseline.maxSuspicious[type];
    if (actual > max) failures.push(`${type}: ${actual}/${max}`);
  }

  if (failures.length) {
    console.error(`QUALITY GATE FAILED: suspicious counts exceeded ${baselinePathArg}`);
    for (const failure of failures) console.error(`- ${failure}`);
    const firstProblemType = failures[0].split(":")[0];
    const firstProblem = rows.find((row) => row.suspicious === firstProblemType);
    if (firstProblem) console.error(`First ${firstProblemType}: ${firstProblem.key}`);
    process.exit(1);
  }

  console.log(`QUALITY GATE: suspicious counts within ${baselinePathArg}`);
} else if (suspiciousCount) {
  console.log("\nSUSPICIOUS SAMPLE:");
  for (const row of rows.filter((r) => r.suspicious).slice(0, 25)) {
    console.log(`- [${row.suspicious}] ${row.key}`);
  }
}

console.log("OK: dict quality lint done");
