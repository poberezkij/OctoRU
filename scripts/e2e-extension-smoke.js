#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const extensionPath = rootDir;
const testUrl = "https://github.com/poberezkij/OctoRU";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function loadDefaultTranslations() {
  const scriptPath = path.resolve(rootDir, "default-translations.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: scriptPath });
  return context.window.GHRU_DEFAULT_TRANSLATIONS || {};
}

function fixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OctoRU extension smoke</title>
</head>
<body>
  <header>
    <nav aria-label="Global">
      <a id="sign-in" href="/login">Sign in</a>
      <a id="pull-requests" href="/pulls">Pull requests</a>
      <a id="issues" href="/issues">Issues</a>
      <form>
        <input id="search" type="text" placeholder="Search GitHub" aria-label="Search GitHub">
      </form>
      <button id="save" title="Save">Save</button>
    </nav>
  </header>
  <main>
    <div class="UnderlineNav" role="navigation" aria-label="Repository">
      <a id="code-tab" href="/poberezkij/OctoRU">Code</a>
      <a id="actions-tab" href="/poberezkij/OctoRU/actions">Actions</a>
    </div>

    <article id="readme" class="markdown-body">
      <h1>Sign in</h1>
      <p>Save Pull requests Issues Code</p>
      <code>Save</code>
    </article>

    <div id="comment" class="timeline-comment">
      <p>Sign in Save Issues</p>
    </div>

    <pre id="code-block"><code>Sign in Save Issues</code></pre>
  </main>
</body>
</html>`;
}

async function runSmoke() {
  let playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    console.log("SKIP: playwright not installed. Install devDependency 'playwright' for extension e2e smoke.");
    return;
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "octoru-extension-smoke-"));
  let context;
  try {
    context = await playwright.chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const page = await context.newPage();
    await page.route(testUrl, (route) => route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureHtml()
    }));

    await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    const t = loadDefaultTranslations();
    const expected = {
      signIn: t["Sign in"],
      pullRequests: t["Pull requests"],
      issues: t.Issues,
      save: t.Save,
      searchGithub: t["Search GitHub"],
      code: t.Code,
      actions: t.Actions
    };

    for (const [key, value] of Object.entries(expected)) {
      if (typeof value !== "string" || !value.trim()) {
        fail(`Missing default translation for ${key}`);
      }
    }

    await page.waitForFunction((value) => {
      return document.querySelector("#sign-in")?.textContent?.trim() === value;
    }, expected.signIn, { timeout: 10000 });

    const actual = await page.evaluate(() => ({
      signIn: document.querySelector("#sign-in")?.textContent?.trim(),
      pullRequests: document.querySelector("#pull-requests")?.textContent?.trim(),
      issues: document.querySelector("#issues")?.textContent?.trim(),
      saveText: document.querySelector("#save")?.textContent?.trim(),
      saveTitle: document.querySelector("#save")?.getAttribute("title"),
      searchPlaceholder: document.querySelector("#search")?.getAttribute("placeholder"),
      searchAria: document.querySelector("#search")?.getAttribute("aria-label"),
      codeTab: document.querySelector("#code-tab")?.textContent?.trim(),
      actionsTab: document.querySelector("#actions-tab")?.textContent?.trim(),
      readme: document.querySelector("#readme")?.textContent?.replace(/\s+/g, " ").trim(),
      comment: document.querySelector("#comment")?.textContent?.replace(/\s+/g, " ").trim(),
      codeBlock: document.querySelector("#code-block")?.textContent?.replace(/\s+/g, " ").trim()
    }));

    const checks = [
      ["header Sign in", actual.signIn, expected.signIn],
      ["header Pull requests", actual.pullRequests, expected.pullRequests],
      ["header Issues", actual.issues, expected.issues],
      ["button text", actual.saveText, expected.save],
      ["button title", actual.saveTitle, expected.save],
      ["search placeholder", actual.searchPlaceholder, expected.searchGithub],
      ["search aria-label", actual.searchAria, expected.searchGithub],
      ["repo Code tab", actual.codeTab, expected.code],
      ["repo Actions tab", actual.actionsTab, expected.actions]
    ];

    for (const [label, got, want] of checks) {
      if (got !== want) {
        fail(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
    }

    const untouchedChecks = [
      ["README markdown body", actual.readme, "Sign in Save Pull requests Issues Code Save"],
      ["timeline comment", actual.comment, "Sign in Save Issues"],
      ["code block", actual.codeBlock, "Sign in Save Issues"]
    ];

    for (const [label, got, want] of untouchedChecks) {
      if (got !== want) {
        fail(`${label} should stay untouched: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
      }
    }

    console.log("OK: extension smoke passed (UI translated, user content untouched)");
  } catch (e) {
    const message = String(e?.message || e);
    if (/Executable doesn't exist|browserType\.launch/i.test(message) && process.env.CI !== "true") {
      console.log("SKIP: Playwright browser binaries are missing. Run: npx playwright install chromium");
      return;
    }
    throw e;
  } finally {
    if (context) await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

runSmoke().catch((e) => {
  console.error(`ERROR: ${e.message || String(e)}`);
  process.exit(1);
});
