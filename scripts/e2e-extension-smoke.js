#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const rootDir = path.resolve(__dirname, "..");
const extensionPath = rootDir;
const baseUrl = "https://github.com";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function loadTranslations() {
  const scriptPath = path.resolve(rootDir, "default-translations.js");
  const source = fs.readFileSync(scriptPath, "utf8");
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: scriptPath });
  const bundledPath = path.resolve(rootDir, "bundled-dictionary.json");
  const bundled = JSON.parse(fs.readFileSync(bundledPath, "utf8"));
  return {
    ...(context.window.GHRU_DEFAULT_TRANSLATIONS || {}),
    ...bundled
  };
}

function repoFixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OctoRU repo smoke</title>
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

function issuesFixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OctoRU issues smoke</title>
</head>
<body>
  <header>
    <nav aria-label="Global">
      <a id="pull-requests" href="/pulls">Pull requests</a>
      <a id="issues" href="/issues">Issues</a>
      <a id="notifications" href="/notifications">Notifications</a>
    </nav>
  </header>
  <main>
    <h1 id="issues-heading">Issues</h1>
    <div class="table-list-header">
      <button id="open-filter">Open</button>
      <button id="closed-filter">Closed</button>
      <button id="label-filter">Label</button>
      <button id="milestone-filter">Milestone</button>
      <button id="new-issue">New issue</button>
    </div>
    <p id="empty-hint" role="status">Try adjusting your search filters.</p>
    <p id="contribution-date" role="status">1 contribution on February 13th</p>
    <p id="big-file-warning" role="alert">Yowza, that's a big file. Try again with a file smaller than 25MB</p>
    <p id="image-size-warning" role="alert">Images should be at least 320×320px (640×640px for best display)</p>
    <p id="picture-size-warning" role="alert">Please upload a picture smaller than 10,000x10,000</p>
    <a id="issue-title" class="js-issue-title" href="/poberezkij/OctoRU/issues/1">Sign in Save Issues</a>
  </main>
</body>
</html>`;
}

function settingsFixtureHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>OctoRU settings smoke</title>
</head>
<body>
  <header>
    <nav aria-label="Global">
      <a id="profile-link" href="/settings/profile">Profile</a>
      <a id="sign-out" href="/logout">Sign out</a>
    </nav>
  </header>
  <main class="settings-main">
    <nav class="menu" aria-label="Settings">
      <a id="settings-menu" href="/settings/profile">Settings</a>
      <a id="security-menu" href="/settings/security">Security</a>
      <a id="appearance-menu" href="/settings/appearance">Appearance</a>
    </nav>
    <section class="settings-content">
      <h1 id="settings-heading">Settings</h1>
      <label for="profile-name">Name</label>
      <input id="profile-name" type="text" placeholder="Name" aria-label="Name">
      <button id="save-settings" title="Save">Save</button>
      <p id="template-gmt" role="status">(GMT+3:00) Moscow</p>
      <p id="template-price" role="status">($0.3 USD per request)</p>
      <p id="template-owner" role="status">poberezkij, Owner (AdminUser)</p>
      <p id="template-starred" role="status">123 users starred this repository</p>
      <p id="template-updated" role="status">(Updated 5/2026)</p>
      <textarea id="bio" placeholder="Save">Sign in Save Issues</textarea>
    </section>
  </main>
</body>
</html>`;
}

function fixtureForPath(pathname) {
  if (pathname === "/poberezkij/OctoRU/issues") return issuesFixtureHtml();
  if (pathname === "/settings/profile") return settingsFixtureHtml();
  return repoFixtureHtml();
}

function requireTranslation(translations, key) {
  const value = translations[key];
  if (typeof value !== "string" || !value.trim()) {
    fail(`Missing translation for ${JSON.stringify(key)}`);
  }
  return value;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function collectPageState(page) {
  return page.evaluate(() => {
    const text = (selector) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
    const attr = (selector, name) => document.querySelector(selector)?.getAttribute(name);
    return {
      signIn: text("#sign-in"),
      pullRequests: text("#pull-requests"),
      issues: text("#issues"),
      notifications: text("#notifications"),
      saveText: text("#save"),
      saveTitle: attr("#save", "title"),
      searchPlaceholder: attr("#search", "placeholder"),
      searchAria: attr("#search", "aria-label"),
      codeTab: text("#code-tab"),
      actionsTab: text("#actions-tab"),
      readme: text("#readme"),
      comment: text("#comment"),
      codeBlock: text("#code-block"),
      issuesHeading: text("#issues-heading"),
      openFilter: text("#open-filter"),
      closedFilter: text("#closed-filter"),
      labelFilter: text("#label-filter"),
      milestoneFilter: text("#milestone-filter"),
      newIssue: text("#new-issue"),
      emptyHint: text("#empty-hint"),
      contributionDate: text("#contribution-date"),
      bigFileWarning: text("#big-file-warning"),
      imageSizeWarning: text("#image-size-warning"),
      pictureSizeWarning: text("#picture-size-warning"),
      issueTitle: text("#issue-title"),
      profileLink: text("#profile-link"),
      signOut: text("#sign-out"),
      settingsMenu: text("#settings-menu"),
      securityMenu: text("#security-menu"),
      appearanceMenu: text("#appearance-menu"),
      settingsHeading: text("#settings-heading"),
      profileNameLabel: text("label[for='profile-name']"),
      profileNamePlaceholder: attr("#profile-name", "placeholder"),
      profileNameAria: attr("#profile-name", "aria-label"),
      saveSettingsText: text("#save-settings"),
      saveSettingsTitle: attr("#save-settings", "title"),
      templateGmt: text("#template-gmt"),
      templatePrice: text("#template-price"),
      templateOwner: text("#template-owner"),
      templateStarred: text("#template-starred"),
      templateUpdated: text("#template-updated"),
      bioText: document.querySelector("#bio")?.value,
      bioPlaceholder: attr("#bio", "placeholder")
    };
  });
}

async function expectTranslated(page, selector, expected) {
  await page.waitForFunction(
    ({ selector, expected }) => document.querySelector(selector)?.textContent?.trim() === expected,
    { selector, expected },
    { timeout: 10000 }
  );
}

function assertPairs(label, actual, checks) {
  for (const [field, got, want] of checks) {
    if (normalizeText(got) !== normalizeText(want)) {
      fail(`${label} ${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    }
  }
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

    const translations = loadTranslations();
    const t = (key) => requireTranslation(translations, key);

    const page = await context.newPage();
    await page.route(`${baseUrl}/**`, (route) => {
      const url = new URL(route.request().url());
      return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: fixtureForPath(url.pathname)
      });
    });

    await page.goto(`${baseUrl}/poberezkij/OctoRU`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await expectTranslated(page, "#sign-in", t("Sign in"));
    let actual = await collectPageState(page);
    assertPairs("repo", actual, [
      ["header Sign in", actual.signIn, t("Sign in")],
      ["header Pull requests", actual.pullRequests, t("Pull requests")],
      ["header Issues", actual.issues, t("Issues")],
      ["button text", actual.saveText, t("Save")],
      ["button title", actual.saveTitle, t("Save")],
      ["search placeholder", actual.searchPlaceholder, t("Search GitHub")],
      ["search aria-label", actual.searchAria, t("Search GitHub")],
      ["repo Code tab", actual.codeTab, t("Code")],
      ["repo Actions tab", actual.actionsTab, t("Actions")],
      ["README markdown body", actual.readme, "Sign in Save Pull requests Issues Code Save"],
      ["timeline comment", actual.comment, "Sign in Save Issues"],
      ["code block", actual.codeBlock, "Sign in Save Issues"]
    ]);

    await page.goto(`${baseUrl}/poberezkij/OctoRU/issues`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await expectTranslated(page, "#issues-heading", t("Issues"));
    actual = await collectPageState(page);
    assertPairs("issues", actual, [
      ["header Pull requests", actual.pullRequests, t("Pull requests")],
      ["header Issues", actual.issues, t("Issues")],
      ["header Notifications", actual.notifications, t("Notifications")],
      ["heading", actual.issuesHeading, t("Issues")],
      ["Open filter", actual.openFilter, t("Open")],
      ["Closed filter", actual.closedFilter, t("Closed")],
      ["Label filter", actual.labelFilter, t("Label")],
      ["Milestone filter", actual.milestoneFilter, t("Milestone")],
      ["New issue", actual.newIssue, t("New issue")],
      ["empty hint", actual.emptyHint, `${t("Try adjusting your search filters")}.`],
      ["contribution date", actual.contributionDate, "1 вклад 13 февраля"],
      ["big file warning", actual.bigFileWarning, "Ого, это большой файл. Попробуйте ещё раз с файлом меньше 25 МБ"],
      ["image size warning", actual.imageSizeWarning, "Изображения должны быть не меньше 320×320px (для лучшего отображения — 640×640px)"],
      ["picture size warning", actual.pictureSizeWarning, "Пожалуйста, загрузите изображение меньше 10,000×10,000"],
      ["issue title", actual.issueTitle, "Sign in Save Issues"]
    ]);

    await page.goto(`${baseUrl}/settings/profile`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await expectTranslated(page, "#settings-heading", t("Settings"));
    actual = await collectPageState(page);
    assertPairs("settings", actual, [
      ["profile link", actual.profileLink, t("Profile")],
      ["sign out", actual.signOut, t("Sign out")],
      ["settings menu", actual.settingsMenu, t("Settings")],
      ["security menu", actual.securityMenu, t("Security")],
      ["appearance menu", actual.appearanceMenu, t("Appearance")],
      ["heading", actual.settingsHeading, t("Settings")],
      ["name label", actual.profileNameLabel, t("Name")],
      ["name placeholder", actual.profileNamePlaceholder, t("Name")],
      ["name aria-label", actual.profileNameAria, t("Name")],
      ["save button", actual.saveSettingsText, t("Save")],
      ["save title", actual.saveSettingsTitle, t("Save")],
      ["GMT template", actual.templateGmt, t("(GMT+{N}:{N}) Moscow").replace("{N}", "3").replace("{N}", "00")],
      ["price template", actual.templatePrice, t("(${N}.{N} USD per request)").replace("{N}", "0").replace("{N}", "3")],
      ["owner template", actual.templateOwner, t("{USERNAME}, Owner (USERNAME)").replace("{USERNAME}", "poberezkij").replace("(USERNAME)", "(AdminUser)")],
      ["starred template", actual.templateStarred, t("{N} users starred this repository").replace("{N}", "123")],
      ["updated template", actual.templateUpdated, t("(Updated {N}/{YEAR})").replace("{N}", "5").replace("{YEAR}", "2026")],
      ["bio value", actual.bioText, "Sign in Save Issues"],
      ["bio placeholder", actual.bioPlaceholder, "Save"]
    ]);

    console.log("OK: extension smoke passed (repo/issues/settings UI translated, user content untouched)");
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
