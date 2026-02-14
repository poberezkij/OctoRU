#!/usr/bin/env node
"use strict";

async function run() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    console.log("SKIP: playwright не установлен. Установите devDependency 'playwright' для e2e smoke.");
    return;
  }

  const browser = await playwright.chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto("https://github.com", { waitUntil: "domcontentloaded", timeout: 30000 });

    const title = await page.title();
    if (!/GitHub/i.test(title)) {
      throw new Error(`unexpected_title: ${title}`);
    }

    await page.waitForSelector("header", { timeout: 10000 });
    console.log("OK: e2e smoke passed");
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(`ERROR: ${e.message || String(e)}`);
  process.exit(1);
});
