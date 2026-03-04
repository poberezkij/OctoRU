#!/usr/bin/env node
"use strict";

const CASES = [
  {
    name: "home",
    url: "https://github.com/",
    selectors: ["header", "a[href='/login']"]
  },
  {
    name: "explore",
    url: "https://github.com/explore",
    selectors: ["main", "h1, h2"]
  },
  {
    name: "pricing",
    url: "https://github.com/pricing",
    selectors: ["main", "body"]
  },
  {
    name: "features_actions",
    url: "https://github.com/features/actions",
    selectors: ["main", "h1, h2"]
  },
  {
    name: "login",
    url: "https://github.com/login",
    selectors: ["form", "input[name='login']"]
  }
];

async function gotoWithRetry(page, url, retries = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      const status = response?.status?.() ?? 0;
      if (status >= 400) throw new Error(`http_${status}`);
      return;
    } catch (e) {
      lastError = e;
      if (attempt === retries) break;
      await page.waitForTimeout(1200 * attempt);
    }
  }
  throw lastError || new Error(`goto_failed_${url}`);
}

async function validateCase(page, testCase) {
  await gotoWithRetry(page, testCase.url, 2);
  for (const selector of testCase.selectors) {
    await page.waitForSelector(selector, { timeout: 20000, state: "attached" });
  }
  const title = await page.title();
  if (!/GitHub/i.test(title)) {
    throw new Error(`unexpected_title_${testCase.name}: ${title}`);
  }
}

async function run() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    console.log("SKIP: playwright not installed. Install devDependency 'playwright' for e2e smoke.");
    return;
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (e) {
    const msg = String(e?.message || e);
    if (/Executable doesn't exist|browserType\.launch/i.test(msg) && process.env.CI !== "true") {
      console.log("SKIP: Playwright browser binaries are missing. Run: npx playwright install chromium");
      return;
    }
    throw e;
  }

  try {
    const page = await browser.newPage();
    for (const testCase of CASES) {
      await validateCase(page, testCase);
      console.log(`OK: ${testCase.name}`);
    }
    console.log(`OK: e2e smoke passed (${CASES.length} pages)`);
  } finally {
    await browser.close();
  }
}

run().catch((e) => {
  console.error(`ERROR: ${e.message || String(e)}`);
  process.exit(1);
});
