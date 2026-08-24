#!/usr/bin/env node
"use strict";

const { buildUntranslatedIssue } = require("../report-utils.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(buildUntranslatedIssue("   ", "https://github.com/", "browser") === null,
  "An empty selection must not create an issue");

const issue = buildUntranslatedIssue(
  "  Getting started  ",
  "https://github.com/dashboard",
  "Test Browser"
);

assert(issue, "A selected UI string must create an issue payload");
assert(issue.issueTitle === "Непереведённый текст: Getting started", "The title must use trimmed text");
assert(issue.issueBody.includes("https://github.com/dashboard"), "The issue must contain the page URL");
assert(issue.issueBody.includes("Test Browser"), "The issue must contain the browser identifier");
assert(!issue.issueBody.includes("<вставьте текст>"), "The issue must never contain a placeholder");
assert(!issue.issueBody.includes("Профиль:"), "The issue must not claim the maintainer is the reporter");

const parsedUrl = new URL(issue.issueUrl);
assert(parsedUrl.origin === "https://github.com", "The report must open GitHub");
assert(parsedUrl.pathname === "/poberezkij/OctoRU/issues/new", "The report must target OctoRU issues");
assert(parsedUrl.searchParams.get("title") === issue.issueTitle, "The issue URL must contain the title");
assert(parsedUrl.searchParams.get("body") === issue.issueBody, "The issue URL must contain the body");

console.log("Popup report tests passed: 10");
