#!/usr/bin/env node
"use strict";

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

function classifyKey(key) {
  if (hasEmail(key)) return "user_content";
  if (hasOwnerRepoWithContext(key)) return "user_content";
  if (hasExplicitUserMention(key)) return "user_content";
  return "ui";
}

const fixtures = [
  { key: "Sign in", expected: "ui" },
  { key: "Security", expected: "ui" },
  { key: "Participating, @mentions and custom", expected: "ui" },
  { key: "Manage email user@example.com", expected: "user_content" },
  { key: "@SomeUser123's untitled project", expected: "user_content" },
  { key: "Dismissed a repository from sipeed/picoclaw. Thank you for the feedback", expected: "user_content" }
];

let failed = 0;
for (const row of fixtures) {
  const actual = classifyKey(row.key);
  if (actual !== row.expected) {
    failed++;
    console.error(`FAILED: "${row.key}" => ${actual}, expected ${row.expected}`);
  }
}

if (failed > 0) {
  console.error(`Boundary fixtures failed: ${failed}`);
  process.exit(1);
}

console.log(`Boundary fixtures passed: ${fixtures.length}`);
