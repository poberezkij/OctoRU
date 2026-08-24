#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function readJsonObject(filePath, label) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (e) {
    fail(`Failed to read ${label}: ${e.message || String(e)}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (e) {
    fail(`Invalid JSON in ${label}: ${e.message || String(e)}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    fail(`${label} must be a JSON object`);
  }
  return parsed;
}

function addFile(files, file) {
  if (typeof file === "string" && file.trim()) files.add(file.trim());
}

function addIconFiles(files, icons) {
  if (!icons || typeof icons !== "object" || Array.isArray(icons)) return;
  for (const value of Object.values(icons)) {
    addFile(files, value);
  }
}

const rootDir = process.cwd();
const manifest = readJsonObject(path.resolve(rootDir, "manifest.json"), "manifest.json");
const runtimeFiles = [
  "bundled-dictionary.json",
  "dict-version.json"
];

if (manifest.manifest_version !== 3) {
  fail(`Expected manifest_version=3, got ${manifest.manifest_version}`);
}

const referencedFiles = new Set();
addIconFiles(referencedFiles, manifest.icons);
addFile(referencedFiles, manifest.background?.service_worker);
addFile(referencedFiles, manifest.action?.default_popup);
addIconFiles(referencedFiles, manifest.action?.default_icon);
addFile(referencedFiles, manifest.options_page);

for (const entry of manifest.content_scripts || []) {
  for (const jsFile of entry?.js || []) {
    addFile(referencedFiles, jsFile);
  }
  for (const cssFile of entry?.css || []) {
    addFile(referencedFiles, cssFile);
  }
}
for (const file of runtimeFiles) {
  addFile(referencedFiles, file);
}

// Validate local scripts and styles referenced by extension HTML pages as well.
for (const htmlFile of Array.from(referencedFiles).filter((file) => /\.html$/i.test(file))) {
  const htmlPath = path.resolve(rootDir, htmlFile);
  if (!fs.existsSync(htmlPath)) continue;
  const html = fs.readFileSync(htmlPath, "utf8");
  const assetPattern = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(assetPattern)) {
    const asset = String(match[1] || "").trim();
    if (!asset || /^(?:https?:|data:|#|\/\/)/i.test(asset)) continue;
    addFile(referencedFiles, path.posix.join(path.posix.dirname(htmlFile), asset));
  }
}

const missing = Array.from(referencedFiles)
  .filter((file) => !fs.existsSync(path.resolve(rootDir, file)))
  .sort((a, b) => a.localeCompare(b));

if (missing.length) {
  fail(`Manifest references missing file(s): ${missing.join(", ")}`);
}

console.log(`OK: extension assets exist (${referencedFiles.size} file(s))`);
