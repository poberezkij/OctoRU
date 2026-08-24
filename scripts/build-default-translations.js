#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const positionalArgs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const sourceArg = positionalArgs[0] || "dict-sections/05-bootstrap.json";
const outputArg = positionalArgs[1] || "default-translations.js";
const checkOnly = process.argv.includes("--check");
const sourcePath = path.resolve(process.cwd(), sourceArg);
const outputPath = path.resolve(process.cwd(), outputArg);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

let source;
try {
  source = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
} catch (error) {
  fail(`Failed to read ${sourceArg}: ${error.message || String(error)}`);
}

if (!source || typeof source !== "object" || Array.isArray(source)) {
  fail(`${sourceArg} must contain a JSON object`);
}

const translations = {};
for (const key of Object.keys(source).sort((a, b) => a.localeCompare(b))) {
  if (key.startsWith("//")) continue;
  const value = source[key];
  if (typeof value !== "string" || !key.trim() || !value.trim()) continue;
  translations[key] = value;
}

const generated = [
  "// Generated from dict-sections/05-bootstrap.json. Do not edit manually.",
  "// This small dictionary keeps critical UI translations available during startup.",
  "",
  `window.GHRU_DEFAULT_TRANSLATIONS = ${JSON.stringify(translations, null, 2)};`,
  "",
  "// Glossary mode: keep disabled to avoid noisy UI labels.",
  "window.GHRU_GLOSSARY_TERMS = {};",
  ""
].join("\n");

if (checkOnly) {
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
  if (current !== generated) fail(`${outputArg} is stale; run npm run default:build`);
  console.log(`OK: ${outputArg} matches ${sourceArg} (${Object.keys(translations).length} keys)`);
  process.exit(0);
}

fs.writeFileSync(outputPath, generated, "utf8");
console.log(`OK: generated ${outputArg} from ${sourceArg} (${Object.keys(translations).length} keys)`);
