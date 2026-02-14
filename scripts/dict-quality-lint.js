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
  if (/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(t)) return "owner_repo";
  if (/^.{181,}$/.test(t)) return "long";
  if (/^\S+$/.test(t) && /[+#*]/.test(t)) return "token";
  return "";
}

const dict = readJsonObject(dictPath, dictPathArg);
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
let suspiciousCount = 0;
for (const row of rows) {
  counts[row.section] += 1;
  if (row.suspicious) suspiciousCount += 1;
}

console.log(`QUALITY SUMMARY: total=${rows.length} suspicious=${suspiciousCount}`);
for (const section of ["repo_home", "issues", "pr", "settings", "other"]) {
  console.log(`${section}: ${counts[section]}`);
}

if (suspiciousCount) {
  console.log("\nSUSPICIOUS SAMPLE:");
  for (const row of rows.filter((r) => r.suspicious).slice(0, 25)) {
    console.log(`- [${row.suspicious}] ${row.key}`);
  }
}

console.log("OK: dict quality lint done");
