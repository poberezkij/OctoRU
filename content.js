

const DEFAULT_TRANSLATIONS = (window.GHRU_DEFAULT_TRANSLATIONS || {});
const GLOSSARY_TERMS = (window.GHRU_GLOSSARY_TERMS || {});

const SETTINGS_DEFAULTS = {
  enabled: true,
  translateAttributes: true,
  glossaryMode: false,
  collectUntranslated: true,
  strictUiOnlyMode: true,
  collectorRelaxedMode: false,
  debugCollector: false,
  adminMode: false,
  customTranslations: {}
};
const LOCAL_CUSTOM_DICT_KEY = 'ghru_custom_dict_v2';

function bgSend(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => resolve(res));
    } catch (e) {
      resolve(null);
    }
  });
}

const TRANSLATABLE_ATTRS = [
  "aria-label",
  "title",
  "placeholder",
  "value",
  "data-confirm",
  "data-confirm-text"
];
const DO_NOT_TRANSLATE_SELECTORS = [
  "pre",
  "code",
  ".blob-code",
  ".blob-wrapper",
  ".js-diff-progressive-container",
  ".js-file",
  ".diff-table",
  ".markdown-body",
  ".timeline-comment",
  ".TimelineItem-body",
  ".TimelineItem .comment",
  ".js-timeline-item",
  ".js-comment-container",
  ".js-discussion-comment",
  ".discussion-comment",
  ".discussion-timeline-item",
  ".comment-body",
  ".js-comment-body",
  ".js-issue-body",
  ".js-discussion",
  ".react-issue-comment",
  ".react-issue-body",
  ".js-pull-refresh-on-pjax",
  "[data-testid='issue-body']",
  "[data-testid*='comment']",
  "[data-testid*='discussion-post']",
  "[itemprop='description']",
  "[data-testid='repository-description']",
  ".repository-description",
  ".gh-header-title",
  ".js-issue-title",
  ".repository-content .Box .markdown-body",
  "textarea",
  "[contenteditable='true']"
];
const DO_NOT_TRANSLATE_SELECTOR_QUERY = DO_NOT_TRANSLATE_SELECTORS.join(",");

const STRICT_UI_BASE_SELECTORS = [
  "header",
  "nav",
  "footer",
  "form",
  "button",
  "summary",
  "label",
  "legend",
  "h1",
  "h2",
  "h3",
  ".h1",
  ".h2",
  ".h3",
  "[role='heading']",
  "[role='button']",
  "[role='menu']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='tablist']",
  "[role='dialog']",
  "[role='alert']",
  "[role='status']",
  "[role='navigation']",
  ".btn",
  ".Button",
  ".UnderlineNav",
  ".subnav",
  ".paginate-container",
  ".pagination",
  ".blankslate",
  ".blankslate-heading",
  ".flash",
  ".flash-full",
  ".ActionList",
  ".SelectMenu",
  ".HeaderMenu",
  ".AppHeader",
  ".js-header-wrapper",
  "[data-view-component='true'][role='button']"
];

const STRICT_UI_ROUTE_SELECTORS = [
  {
    test: /^\/[^/]+\/[^/]+\/(issues|pulls)(?:\/|$)/i,
    selectors: [
      ".gh-header-meta",
      ".gh-header-actions",
      ".gh-header-show",
      ".table-list-header",
      ".blankslate",
      ".blankslate-heading",
      ".js-issues-search",
      ".js-check-all-container",
      ".paginate-container"
    ]
  },
  {
    test: /^\/[^/]+\/[^/]+\/?$/i,
    selectors: [
      ".git-clone-help",
      ".git-clone-help .Box-header",
      ".git-clone-help .Box-body",
      ".git-clone-help .Box-title",
      ".git-clone-help .mb-0",
      ".height-full.border.rounded-2.p-4",
      ".height-full.border.rounded-2.p-4 .h4",
      ".height-full.border.rounded-2.p-4 .color-fg-muted"
    ]
  },
  {
    test: /^\/[^/]+\/[^/]+\/discussions(?:\/|$)/i,
    selectors: [
      ".gh-header-actions",
      ".subnav",
      ".discussion-sidebar",
      ".js-discussion-header"
    ]
  },
  {
    test: /^\/settings(?:\/|$)/i,
    selectors: [
      ".settings-content",
      ".settings-main",
      "#user-profile-frame",
      ".menu",
      ".Box-header"
    ]
  },
  {
    test: /^\/notifications(?:\/|$)/i,
    selectors: [
      ".notifications-list",
      ".notifications-mark-all-form",
      ".notifications-v2",
      ".js-notifications-list"
    ]
  }
];

let settings = { ...SETTINGS_DEFAULTS };
let translations = new Map();          
let translationsCI = new Map();        

let observer = null;
let spaHooksAttached = false;
let queue = new Set();
let flushTimer = null;
let untranslated = new Set();
let untranslatedPending = new Set();
let untranslatedFlushTimer = null;
let coverageTranslatedPending = new Set();
let coverageUntranslatedPending = new Set();
let coverageFlushTimer = null;
let collectorDebugPendingReasons = new Map();
let collectorDebugPendingSamples = new Map();
let collectorDebugFlushTimer = null;

let blacklistedElementCache = new WeakMap();
let allowedUiContextCache = new WeakMap();
let repoUserContentContextCache = new WeakMap();
let strictUiSelectorCachePath = "";
let strictUiSelectorCache = [];

const COLLECTOR_LANGUAGE_STOPLIST = new Set([
  "b (formal method)",
  "c#",
  "c++",
  "cap'n proto",
  "f#",
  "f*",
  "graphviz (username)",
  "html+ecr",
  "html+eex",
  "html+erb",
  "html+php",
  "html+razor",
  "javascript+erb",
  "netlinx+erb",
  "omnet++ msg",
  "omnet++ ned",
  "objective-c++",
  "q#",
  "ren'py",
  "shell"
]);

async function loadUntranslated() {
  const res = await bgSend({ type: 'ghruGetUntranslated' });
  const list = Array.isArray(res?.list) ? res.list : [];
  untranslated = new Set(list);
}

function scheduleUntranslatedFlush() {
  if (untranslatedFlushTimer) return;
  untranslatedFlushTimer = setTimeout(async () => {
    untranslatedFlushTimer = null;
    const items = Array.from(untranslatedPending);
    untranslatedPending.clear();
    if (!items.length) return;
    await bgSend({ type: 'ghruReportUntranslated', items });
  }, 800);
}

function looksLikeISODateTime(s) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(s);
}
function looksLikeISODate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function looksLikeMonthDate(s) {
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}(?:,.*)?$/.test(s);
}
function looksLikeMonthYear(s) {
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?\s+\d{4}$/.test(s);
}
function looksLikeMonthRangeWithYear(s) {
  return /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s*[-\u2013\u2014]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{1,2},\s*\d{4}$/.test(s);
}
function looksLikeYearBoundUIPhrase(s) {
  const t = s.trim();
  if (/^Contribution activity in\s+\d{4}$/i.test(t)) return true;
  if (/^Usage\s+\w+,\s+[A-Za-z]{3,9}\s+\d{1,2}\s+\d{4},\s+Gross:/i.test(t)) return true;
  if (/^View details of session .* last accessed [A-Za-z]{3,9}\s+\d{1,2},\s+\d{4}$/i.test(t)) return true;
  return false;
}
function containsGMTOffset(s) {
  return /\(\s*GMT\s*[+-]\d{2}:\d{2}\s*\)/i.test(s);
}
function looksLikeJSONBlob(s) {
  const t = s.trim();
  return ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) && /":/.test(t);
}
function looksLikeSearchQuery(s) {
  const t = s.trim();
  if (/^-?[a-z][a-z0-9_-]*:[^\s]+$/i.test(t)) return true;
  if (/\b(repo|org|user|lang|is|in|sort|label|milestone|author|assignee|comments|reactions):/i.test(t)) return true;
  if ((/\bAND\b|\bOR\b/i.test(t)) && /:/.test(t)) return true;
  return false;
}
function looksLikeKeyboardHint(s) {
  const t = s.trim();
  if (/^[a-z]\s+then\s+[a-z]$/i.test(t)) return true;   
  if (/^[a-z]\s+then\s+[a-z]\s+then\s+[a-z]$/i.test(t)) return true;
  if (/^[a-z],?\/$/i.test(t)) return true;             
  if (/^[a-z]$/i.test(t)) return true;                 
  return false;
}
function looksLikeNoisyTestLabel(s) {
  const t = s.trim();
  if (/\b\d+-\d+\b/.test(t) && /(Repo Details|repository body)/i.test(t)) return true;
  return false;
}

function detectCoverageSection() {
  const path = String(location?.pathname || "/");
  if (/^\/[^/]+\/[^/]+\/issues(?:\/|$)/i.test(path)) return "issues";
  if (/^\/[^/]+\/[^/]+\/pulls?(?:\/|$)/i.test(path)) return "pr";
  if (
    /^\/[^/]+\/[^/]+\/settings(?:\/|$)/i.test(path) ||
    /^\/settings(?:\/|$)/i.test(path) ||
    /^\/(?:orgs|organizations)\/[^/]+\/settings(?:\/|$)/i.test(path)
  ) return "settings";
  if (/^\/$/.test(path) || /^\/dashboard(?:\/|$)/i.test(path)) return "repo_home";
  if (/^\/[^/]+\/[^/]+\/?$/i.test(path)) return "repo_home";
  return "other";
}

function clearContextCaches() {
  blacklistedElementCache = new WeakMap();
  allowedUiContextCache = new WeakMap();
  repoUserContentContextCache = new WeakMap();
  strictUiSelectorCachePath = "";
  strictUiSelectorCache = [];
}

function pushCoveragePending(setRef, section, key) {
  if (!section || !key) return;
  setRef.add(`${section}\u0000${key}`);
}

function unpackCoveragePending(setRef) {
  const out = [];
  for (const item of setRef) {
    const idx = item.indexOf("\u0000");
    if (idx < 1) continue;
    out.push({ section: item.slice(0, idx), key: item.slice(idx + 1) });
  }
  return out;
}

function scheduleCoverageFlush() {
  if (coverageFlushTimer) return;
  coverageFlushTimer = setTimeout(async () => {
    coverageFlushTimer = null;
    const translated = unpackCoveragePending(coverageTranslatedPending);
    const untranslatedRows = unpackCoveragePending(coverageUntranslatedPending);
    coverageTranslatedPending.clear();
    coverageUntranslatedPending.clear();
    if (!translated.length && !untranslatedRows.length) return;
    await bgSend({ type: "ghruReportCoverage", translated, untranslated: untranslatedRows });
  }, 1200);
}

function bumpCollectorDebug(reason, sample) {
  if (!settings.debugCollector) return;
  const key = String(reason || "").trim();
  if (!key) return;
  collectorDebugPendingReasons.set(key, (collectorDebugPendingReasons.get(key) || 0) + 1);
  if (sample) {
    const list = collectorDebugPendingSamples.get(key) || [];
    if (list.length < 10 && !list.includes(sample)) {
      list.push(sample);
      collectorDebugPendingSamples.set(key, list);
    }
  }
}

function scheduleCollectorDebugFlush() {
  if (!settings.debugCollector) return;
  if (collectorDebugFlushTimer) return;
  collectorDebugFlushTimer = setTimeout(async () => {
    collectorDebugFlushTimer = null;
    if (!collectorDebugPendingReasons.size) return;

    const reasons = {};
    const samples = {};
    for (const [k, n] of collectorDebugPendingReasons.entries()) reasons[k] = n;
    for (const [k, list] of collectorDebugPendingSamples.entries()) samples[k] = list.slice(0, 10);
    collectorDebugPendingReasons.clear();
    collectorDebugPendingSamples.clear();

    await bgSend({
      type: "ghruReportCollectorDebug",
      payload: {
        reasons,
        samples,
        updatedAt: new Date().toISOString()
      }
    });
  }, 1500);
}

function trackCoverageCandidate(rawBase, el, translated) {
  const base = norm(rawBase);
  if (!base) return;
  if (!/[A-Za-z]/.test(base)) return;
  if (/[\u0410-\u042f\u0430-\u044f\u0401\u0451]/.test(base)) return;
  if (!shouldCollectCandidate(base, el, { enforceUiScope: false })) return;
  const section = detectCoverageSection();
  if (translated) {
    pushCoveragePending(coverageTranslatedPending, section, base);
    coverageUntranslatedPending.delete(`${section}\u0000${base}`);
  } else {
    pushCoveragePending(coverageUntranslatedPending, section, base);
  }
  scheduleCoverageFlush();
}
function looksLikeAuditHexToken(s) {
  const t = s.trim();
  return /^(?:[A-F0-9]{3,}[:.-]){3,}[A-F0-9]{3,}$/i.test(t);
}
function looksLikeCssBlob(s) {
  const t = s.trim();
  if (/\{[^}]*fill\s*:/i.test(t)) return true;
  if (/^\.?[A-Za-z0-9_-]+\s*\{[^}]+\}$/.test(t)) return true;
  return false;
}
function looksLikeUserOrRepoToken(s) {
  const t = s.trim();
  if (t.includes(" ")) return false;
  if (/^[A-Z][a-z]+$/.test(t)) return false;
  if (/^(GitHub|Copilot|Dependabot|Codespaces|Actions|Projects|Discussions)$/i.test(t)) return false;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) return true;
  if (/^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+$/.test(t)) return true;
  if (/^[a-z0-9][a-z0-9_.-]{2,}$/i.test(t)) return true;
  return false;
}

function containsUserRepoReference(s) {
  return /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(s);
}

function containsEmail(s) {
  return /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(s);
}

function containsUrlLikeToken(s) {
  return /\bhttps?:\/\/\S+/i.test(s) || /\bwww\.[^\s]+\.[A-Za-z]{2,}\b/i.test(s);
}

function containsExplicitUsernameMention(s) {
  const matches = s.match(/@[A-Za-z0-9_.-]{2,}/g) || [];
  if (!matches.length) return false;
  for (const token of matches) {
    const lowered = token.toLowerCase();
    if (lowered === "@mention" || lowered === "@mentions" || lowered === "@mentioning" || lowered === "@username") continue;
    return true;
  }
  return false;
}

function looksLikeUserActivityPhrase(s) {
  const t = s.trim();
  if (/^[A-Za-z0-9_.-]{2,}\s+had no activity during this period\.?$/i.test(t)) return true;
  if (/^[A-Za-z0-9_.-]{2,}\s+has no activity yet for this period\.?$/i.test(t)) return true;
  if (/^[A-Za-z0-9_.-]{2,}\s*[\u00B7\u2022]$/.test(t)) return true;
  return false;
}

function looksLikeWrappedUserToken(s) {
  const t = s.trim();
  return /^\([A-Za-z0-9_.-]{2,}\)$/.test(t);
}

function looksLikeUiFragment(s) {
  const t = s.trim();
  if (/^,\s*or read more about it at our:?$/i.test(t)) return true;
  return false;
}

function looksLikeCollectorNoiseToken(s) {
  const t = s.trim();
  if (!t) return true;
  if (/^_document_id$/i.test(t)) return true;
  if (/^\["[A-Za-z0-9_-]+"\]$/.test(t)) return true;
  if (/^(repo,\s*user(?:,\s*workflow)?|repo,user(?:,workflow)?|scope\(s\)|supported secrets)$/i.test(t)) return true;
  if (/^[A-Za-z0-9._%+-]+@USERNAME$/i.test(t)) return true;
  if (/^\{N\}\+[A-Za-z0-9._%+-]+@USERNAME$/i.test(t)) return true;
  return false;
}

function looksLikeLanguageTokenNoise(s) {
  const t = norm(s).toLowerCase();
  if (!t) return true;
  if (COLLECTOR_LANGUAGE_STOPLIST.has(t)) return true;
  // Типовые обозначения языков/диалектов: C#, C++, HTML+ERB, Q#, F* и т.п.
  if (/^[a-z0-9][a-z0-9.+#*'_-]*(?:\+\+|#[a-z0-9]*)?(?:\s+[a-z0-9.+#*'_-]+)?$/i.test(t) && /[+#*]/.test(t)) {
    return true;
  }
  return false;
}

function normalizeCollectorKey(key) {
  let t = norm(key);
  if (!t) return "";
  t = t.replace(/@([A-Za-z0-9_.-]{2,})/g, "@USERNAME");
  t = t.replace(/\(([A-Za-z0-9_.-]{2,})\)/g, "(USERNAME)");
  t = t.replace(
    /^([A-Za-z0-9_.-]{2,})\s+(had no activity during this period\.?)$/i,
    "USERNAME $2"
  );
  t = t.replace(
    /^([A-Za-z0-9_.-]{2,})\s+(has no activity yet for this period\.?)$/i,
    "USERNAME $2"
  );
  t = t.replace(/^([A-Za-z0-9_.-]{2,})\s*[\u00B7\u2022]$/, "USERNAME \u00B7");
  t = t.replace(/^([A-Za-z0-9_.-]{2,}),\s+Owner\s+\(USERNAME\)$/i, "USERNAME, Owner (USERNAME)");
  t = t.replace(/\b(19|20)\d{2}\b/g, "{YEAR}");
  t = t.replace(/\b\d+\b/g, "{N}");

  return norm(t);
}

function shouldCollectCandidate(key, el, options = {}) {
  const enforceUiScope = options.enforceUiScope !== false;
  const trackReason = options.trackReason === true;
  const reject = (reason) => {
    if (trackReason && settings.debugCollector) {
      bumpCollectorDebug(reason, typeof key === "string" ? key.slice(0, 120) : "");
      scheduleCollectorDebugFlush();
    }
    return false;
  };

  if (!key) return reject("empty_key");
  if (settings.collectorRelaxedMode) {
    if (/[\u0410-\u042f\u0430-\u044f\u0401\u0451]/.test(key)) return reject("already_russian");
    return true;
  }
  if (enforceUiScope && settings.strictUiOnlyMode !== false && !isAllowedUiContext(el)) return reject("outside_ui_scope");
  if (el && isBlacklistedElement(el)) return reject("blacklisted_element");
  if (el && isRepositoryCardUserContentContext(el)) return reject("user_content_context");
  if (/[\u0410-\u042f\u0430-\u044f\u0401\u0451]/.test(key)) return reject("already_russian");
  if (!/[A-Za-z]/.test(key)) return reject("no_latin_letters");

  const t = key.trim();
  if (t.length < 2 || t.length > 240) return reject("invalid_length");
  if (/^\d+$/.test(t)) return reject("digits_only");
  if (/^[\s\W]+$/.test(t)) return reject("non_word_only");
  if (/[<>]/.test(t)) return reject("html_like");
  if (/^[,.;:]/.test(t)) return reject("punctuation_prefix");
  if (containsGMTOffset(t)) return reject("gmt_offset");
  const letters = (t.match(/[A-Za-z]/g) || []).length;
  const digits = (t.match(/\d/g) || []).length;
  if (digits > 0 && letters > 0 && digits > letters * 2) return reject("too_many_digits");
  if (looksLikeISODateTime(t) || looksLikeISODate(t) || looksLikeMonthDate(t)) return reject("date_like");
  if (looksLikeMonthYear(t) || looksLikeMonthRangeWithYear(t) || looksLikeYearBoundUIPhrase(t)) return reject("year_bound");
  if (looksLikeJSONBlob(t)) return reject("json_blob");
  if (looksLikeSearchQuery(t)) return reject("search_query");
  if (looksLikeKeyboardHint(t)) return reject("keyboard_hint");
  if (looksLikeNoisyTestLabel(t)) return reject("noisy_test_label");
  if (looksLikeAuditHexToken(t)) return reject("audit_token");
  if (looksLikeCssBlob(t)) return reject("css_blob");
  if (looksLikeUiFragment(t)) return reject("ui_fragment");
  if (looksLikeCollectorNoiseToken(t)) return reject("collector_noise");
  if (looksLikeLanguageTokenNoise(t)) return reject("language_token");
  if (containsEmail(t)) return reject("email");
  if (containsUrlLikeToken(t)) return reject("url");
  if (containsExplicitUsernameMention(t)) return reject("explicit_username");
  if (containsUserRepoReference(t)) return reject("owner_repo_reference");
  if (looksLikeUserOrRepoToken(t)) return reject("user_repo_token");
  if (looksLikeUserActivityPhrase(t)) return reject("user_activity_phrase");
  if (looksLikeWrappedUserToken(t)) return reject("wrapped_user_token");
  if (el) {
    const hc = el.closest?.('[data-hovercard-type],[data-hovercard-url]');
    if (hc) return reject("hovercard_context");

    const a = el.closest?.('a[href]');
    if (a) {
      if (a.hasAttribute('data-hovercard-type') || a.hasAttribute('data-hovercard-url')) return reject("hovercard_anchor");

      const href = (a.getAttribute('href') || '').split(/[?#]/)[0];
      const parts = href.split('/').filter(Boolean);
      if (parts.length === 2 && /^[A-Za-z0-9_.-]+$/.test(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(parts[1])) return reject("owner_repo_link");
      if (a.querySelector('img.avatar, img.avatar-user')) return reject("avatar_anchor");
    }
  }

  return true;
}

function maybeCollectUntranslated(rawBase, el, options = {}) {
  if (!settings.enabled) return;
  if (!settings.collectUntranslated) return;
  const raw = norm(rawBase);
  if (!shouldCollectCandidate(raw, el, { ...options, trackReason: settings.debugCollector })) return;
  const key = normalizeCollectorKey(raw);
  if (!key) return;
  if (isLikelyTechnicalText(key)) return;
  if (untranslated.has(key)) return;
  untranslated.add(key);
  untranslatedPending.add(key);
  scheduleUntranslatedFlush();
}

function norm(str) {
  return String(str)
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/([A-Za-z])\?([A-Za-z])/g, "$1'$2")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlacklistedElement(el) {
  if (!el) return true;
  if (blacklistedElementCache.has(el)) return blacklistedElementCache.get(el);
  const result = !!el.closest("[data-no-translate]") || !!el.closest(DO_NOT_TRANSLATE_SELECTOR_QUERY);
  blacklistedElementCache.set(el, result);
  return result;
}

function getActiveStrictUiSelectors() {
  const path = String(location?.pathname || "/");
  if (path === strictUiSelectorCachePath && strictUiSelectorCache.length) return strictUiSelectorCache;
  const out = new Set(STRICT_UI_BASE_SELECTORS);
  for (const group of STRICT_UI_ROUTE_SELECTORS) {
    if (group.test.test(path)) {
      for (const selector of group.selectors) out.add(selector);
    }
  }
  strictUiSelectorCachePath = path;
  strictUiSelectorCache = Array.from(out);
  return strictUiSelectorCache;
}

function isAllowedUiContext(el) {
  if (!el?.closest) return false;
  if (settings.strictUiOnlyMode === false) return true;
  if (allowedUiContextCache.has(el)) return allowedUiContextCache.get(el);
  const selectors = getActiveStrictUiSelectors();
  for (const selector of selectors) {
    if (el.closest(selector)) {
      allowedUiContextCache.set(el, true);
      return true;
    }
  }
  allowedUiContextCache.set(el, false);
  return false;
}

const RESERVED_GITHUB_PATH_PREFIXES = new Set([
  "about",
  "account",
  "apps",
  "collections",
  "contact",
  "customer-stories",
  "dashboard",
  "enterprise",
  "events",
  "explore",
  "features",
  "gist",
  "global-campus",
  "issues",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "readme",
  "search",
  "security",
  "settings",
  "site",
  "sponsors",
  "topics",
  "trending",
  "users"
]);

const GH_COMMON_TEMPLATES = [
  "https://github.com/",
  "https://github.com/dashboard",
  "https://github.com/notifications",
  "https://github.com/pulls",
  "https://github.com/issues",
  "https://github.com/new",
  "https://github.com/search",
  "https://github.com/explore",
  "https://github.com/marketplace",
  "https://github.com/{user}",
  "https://github.com/{user}?tab=repositories",
  "https://github.com/{user}?tab=stars",
  "https://gist.github.com/{user}",
  "https://github.com/sponsors/{user}",
  "https://github.com/settings",
  "https://github.com/settings/profile",
  "https://github.com/settings/account",
  "https://github.com/settings/emails",
  "https://github.com/settings/notifications",
  "https://github.com/settings/appearance",
  "https://github.com/settings/accessibility",
  "https://github.com/settings/security",
  "https://github.com/settings/sessions",
  "https://github.com/settings/keys",
  "https://github.com/settings/tokens",
  "https://github.com/settings/personal-access-tokens",
  "https://github.com/settings/security-log",
  "https://github.com/settings/applications",
  "https://github.com/settings/apps",
  "https://github.com/settings/installations",
  "https://github.com/settings/organizations",
  "https://github.com/settings/copilot",
  "https://github.com/settings/feature_preview",
  "https://github.com/{owner}/{repo}",
  "https://github.com/{owner}/{repo}/issues",
  "https://github.com/{owner}/{repo}/pulls",
  "https://github.com/{owner}/{repo}/actions",
  "https://github.com/{owner}/{repo}/discussions",
  "https://github.com/{owner}/{repo}/projects",
  "https://github.com/{owner}/{repo}/releases",
  "https://github.com/{owner}/{repo}/tags",
  "https://github.com/{owner}/{repo}/commits",
  "https://github.com/{owner}/{repo}/branches",
  "https://github.com/{owner}/{repo}/contributors",
  "https://github.com/{owner}/{repo}/settings"
];

function getSignedInUser() {
  const fromMeta = document.querySelector('meta[name="user-login"]')?.getAttribute("content") || "";
  const fromBody = document.body?.getAttribute("data-user-login") || "";
  const user = String(fromMeta || fromBody || "").trim();
  return user || null;
}

function parseRepoSlugFromHref(href) {
  if (!href) return null;
  const clean = String(href).split("#")[0].split("?")[0];
  if (!clean.startsWith("/")) return null;

  const parts = clean.split("/").filter(Boolean);
  if (parts.length < 2) return null;

  const owner = parts[0];
  const repo = parts[1];
  if (!owner || !repo) return null;
  if (RESERVED_GITHUB_PATH_PREFIXES.has(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null;

  return { owner, repo };
}

function findFirstRepoSlug() {
  const selectors = [
    'aside a[data-hovercard-type="repository"]',
    'a[data-hovercard-type="repository"]',
    'a[href^="/"][data-hydro-click*="repository"]'
  ];

  for (const sel of selectors) {
    const a = document.querySelector(sel);
    const slug = parseRepoSlugFromHref(a?.getAttribute("href"));
    if (slug) return slug;
  }

  const links = Array.from(document.querySelectorAll('a[href^="/"]'));
  for (const a of links) {
    const slug = parseRepoSlugFromHref(a.getAttribute("href"));
    if (slug) return slug;
  }
  return null;
}

function normalizeRepoIdentityText(raw) {
  return norm(String(raw || ""))
    .replace(/\s+/g, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function textMatchesRepoSlug(raw, slug) {
  if (!slug) return false;
  const token = normalizeRepoIdentityText(raw);
  if (!token) return false;
  const owner = String(slug.owner || "").toLowerCase();
  const repo = String(slug.repo || "").toLowerCase();
  if (!owner || !repo) return false;
  return token === owner || token === repo || token === `${owner}/${repo}`;
}

function isRepositoryIdentityText(raw, el) {
  const token = norm(raw);
  if (!token) return false;

  const currentRepo = parseRepoSlugFromHref(location.pathname);
  if (textMatchesRepoSlug(token, currentRepo)) return true;

  const link = el?.closest?.("a[href]");
  const linkedRepo = parseRepoSlugFromHref(link?.getAttribute("href"));
  if (textMatchesRepoSlug(token, linkedRepo)) return true;

  return false;
}

const SAFE_NON_UI_TRANSLATION_KEYS = new Set([
  "existing forks",
  "create a new fork",
  "fork your own copy of",
  "you don't have any forks of this repository",
  "no description, website, or topics provided",
  "no releases published",
  "no packages published",
  "report repository",
  "readme",
  "activity",
  "branch",
  "branches",
  "tag",
  "tags",
  "commit",
  "commits",
  "public",
  "local",
  "clone",
  "clone using the web url",
  "open with github desktop",
  "download zip",
  "go to file",
  "type / to search",
  "stars",
  "star",
  "watching",
  "forks",
  "fork",
  "releases",
  "packages"
]);
const RELATIVE_TIME_SINGLE_TRANSLATIONS = new Map([
  ["just now", "только что"],
  ["a minute ago", "минуту назад"],
  ["an hour ago", "час назад"],
  ["a day ago", "день назад"],
  ["a week ago", "неделю назад"],
  ["a month ago", "месяц назад"],
  ["a year ago", "год назад"],
  ["yesterday", "вчера"]
]);

const OBSERVED_RELATIVE_TIME_SHADOW_ROOTS = new WeakSet();

function pluralRu(count, one, few, many) {
  const n = Math.abs(Number(count)) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function translateRelativeTimeFallback(raw) {
  const source = norm(raw);
  if (!source) return null;

  const direct = RELATIVE_TIME_SINGLE_TRANSLATIONS.get(source.toLowerCase());
  if (direct) return direct;

  const m = source.match(/^(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago$/i);
  if (!m) return null;

  const count = Number(m[1]);
  const unit = m[2].toLowerCase();
  const forms = {
    second: ["секунду", "секунды", "секунд"],
    seconds: ["секунду", "секунды", "секунд"],
    minute: ["минуту", "минуты", "минут"],
    minutes: ["минуту", "минуты", "минут"],
    hour: ["час", "часа", "часов"],
    hours: ["час", "часа", "часов"],
    day: ["день", "дня", "дней"],
    days: ["день", "дня", "дней"],
    week: ["неделю", "недели", "недель"],
    weeks: ["неделю", "недели", "недель"],
    month: ["месяц", "месяца", "месяцев"],
    months: ["месяц", "месяца", "месяцев"],
    year: ["год", "года", "лет"],
    years: ["год", "года", "лет"]
  };
  const selected = forms[unit];
  if (!selected) return null;

  return `${count} ${pluralRu(count, selected[0], selected[1], selected[2])} назад`;
}

function localizeRelativeTimeShadowText(el) {
  const root = el?.shadowRoot;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const current = node.nodeValue;
    if (!current || !current.trim()) continue;

    const translated = translateStringKeepingPunctuation(current) || translateRelativeTimeFallback(current);
    if (translated && translated !== current) {
      node.nodeValue = translated;
    }
  }
}
function canTranslateOutsideUi(base, el) {
  const key = String(base || "").toLowerCase();
  if (!key) return false;
  const isSafeShortLabel =
    SAFE_NON_UI_TRANSLATION_KEYS.has(key) ||
    /^\d+\s+(stars|forks|watching|branch|branches|tag|tags|commit|commits)$/.test(key);

  // Безопасный UI-контекст выпадающих меню GitHub.
  if (el?.closest?.(".SelectMenu, .SelectMenu-modal, .SelectMenu-list, .SelectMenu-item")) {
    return true;
  }
  if (el?.closest?.("[role='menu'], [role='listbox'], [class*='prc-ActionList']")) {
    return true;
  }
  if (el?.matches?.("input[role='combobox'], input[type='search'], input[type='text']")) {
    if (isSafeShortLabel) return true;
  }

  // Правая колонка репозитория: переводим только заранее разрешенные нейтральные фразы.
  if (el?.closest?.(".Layout-sidebar, .BorderGrid")) {
    if (isSafeShortLabel) return true;
  }
  if (isSafeShortLabel && key.length <= 40) return true;

  return false;
}

function localizeRelativeTimeElements(root) {
  if (!root) return;
  const selector = "relative-time, time-ago, time-until, local-time";
  const nodes = [];

  if (root.matches?.(selector)) nodes.push(root);
  if (root.querySelectorAll) nodes.push(...root.querySelectorAll(selector));

  for (const el of nodes) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;
    if (el.getAttribute("lang") !== "ru") {
      el.setAttribute("lang", "ru");
      const dt = el.getAttribute("datetime");
      if (dt != null) el.setAttribute("datetime", dt);
    }

    localizeRelativeTimeShadowText(el);

    const shadow = el.shadowRoot;
    if (shadow && !OBSERVED_RELATIVE_TIME_SHADOW_ROOTS.has(shadow)) {
      OBSERVED_RELATIVE_TIME_SHADOW_ROOTS.add(shadow);
      const shadowObserver = new MutationObserver(() => localizeRelativeTimeShadowText(el));
      shadowObserver.observe(shadow, { childList: true, subtree: true, characterData: true });
    }
  }
}
function fillTemplates(templates, vars) {
  return templates
    .map((t) =>
      t
        .replaceAll("{user}", vars.user ?? "{user}")
        .replaceAll("{owner}", vars.owner ?? "{owner}")
        .replaceAll("{repo}", vars.repo ?? "{repo}")
    )
    .filter((u) => !u.includes("{user}") && !u.includes("{owner}") && !u.includes("{repo}"));
}

function buildGithubCommonUrlsAuto() {
  const user = getSignedInUser();
  const repoSlug = findFirstRepoSlug();
  const vars = {
    user,
    owner: repoSlug?.owner ?? null,
    repo: repoSlug?.repo ?? null
  };

  const urls = fillTemplates(GH_COMMON_TEMPLATES, vars);
  return Array.from(new Set(urls));
}

function looksLikeOwnerRepoPath(href) {
  const path = String(href || "").split(/[?#]/)[0];
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== 2) return false;
  const owner = parts[0].toLowerCase();
  const repo = parts[1].toLowerCase();
  if (RESERVED_GITHUB_PATH_PREFIXES.has(owner)) return false;
  if (repo === "settings" || repo === "issues" || repo === "pulls") return false;
  return /^[A-Za-z0-9_.-]+$/.test(parts[0]) && /^[A-Za-z0-9_.-]+$/.test(parts[1]);
}

function hasOwnerRepoLink(scope) {
  if (!scope?.querySelectorAll) return false;
  const links = scope.querySelectorAll("a[href]");
  for (const a of links) {
    if (!looksLikeOwnerRepoPath(a.getAttribute("href"))) continue;
    // Treat as repository card only when visible link text/label looks like owner/repo.
    const linkText = norm(a.textContent || a.getAttribute("aria-label") || "");
    if (/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(linkText)) return true;
  }
  return false;
}

function isInteractiveUiElementContext(el) {
  if (!el?.closest) return false;
  return !!el.closest(
    "button, summary, [role='button'], [role='menuitem'], [role='tab'], [role='option'], .btn, .Button, nav, header, footer, form, [data-view-component='true'][role='button']"
  );
}

function isRepositoryCardUserContentContext(el) {
  if (!el) return false;
  if (repoUserContentContextCache.has(el)) return repoUserContentContextCache.get(el);
  const container = el?.closest?.(
    "article, li, .Box-row, .feed-item, [data-testid*='feed'], [data-testid*='repository']"
  );
  if (!container) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (container.closest?.("form, [data-testid='settings-layout'], .settings-content")) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (!hasOwnerRepoLink(container)) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (isInteractiveUiElementContext(el)) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (el.closest?.("a[href], time, relative-time, [aria-live], [role='status']")) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  const txt = norm(el.textContent || "");
  if (txt.length < 12) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (txt.length < 28 && !/\s/.test(txt)) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  if (!/[A-Za-z]/.test(txt)) {
    repoUserContentContextCache.set(el, false);
    return false;
  }
  repoUserContentContextCache.set(el, true);
  return true;
}

function isLikelyTechnicalText(text) {
  const t = norm(text);
  if (!t) return true;
  if (/[\u0410-\u042f\u0430-\u044f\u0401\u0451]/.test(t)) return true;

  const lower = t.toLowerCase();
  if (lower.startsWith("git ") || lower.startsWith("npm ") || lower.startsWith("docker ") || lower.startsWith("yarn ")) return true;
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t)) return true;
  if (/^[0-9a-f]{40}$/i.test(t)) return true;
  if (/[\\/]/.test(t) && /\.(md|txt|js|ts|py|go|rs|java|cpp|c|h|yml|yaml|json)$/i.test(t)) return true;

  return false;
}

function isBrokenTranslationValue(value) {
  const t = norm(value);
  if (!t) return true;
  const qCount = (t.match(/\?/g) || []).length;
  const hasOnlyQuestionNoise = qCount >= 3 && /^[\s?.,:;!'"`(){}\[\]\-_/\\]+$/.test(t);
  if (hasOnlyQuestionNoise) return true;
  return false;
}

function buildTranslationMaps() {
  translations = new Map();
  translationsCI = new Map();

  // Сначала загружаем встроенный словарь.
  for (const [k, v] of Object.entries(DEFAULT_TRANSLATIONS || {})) {
    const key = norm(k);
    if (!key || typeof v !== "string" || isBrokenTranslationValue(v)) continue;
    translations.set(key, v);
    translationsCI.set(key.toLowerCase(), v);
  }

  // Затем применяем пользовательский словарь, если значение не битое.
  for (const [k, v] of Object.entries(settings.customTranslations || {})) {
    const key = norm(k);
    if (!key || typeof v !== "string" || isBrokenTranslationValue(v)) continue;
    translations.set(key, v);
    translationsCI.set(key.toLowerCase(), v);
  }

  if (settings.glossaryMode) {
    for (const [k, v] of Object.entries(GLOSSARY_TERMS)) {
      const key = norm(k);
      if (!key || typeof v !== "string" || isBrokenTranslationValue(v)) continue;
      translations.set(key, v);
      translationsCI.set(key.toLowerCase(), v);
    }
  }
}

function applyDynamicRules(key) {
  if (typeof window.ghruApplyDynamicRules !== "function") return null;
  return window.ghruApplyDynamicRules(key, { norm, translations, translationsCI });
}

function buildTemplateLookupKey(raw) {
  const values = {
    numbers: [],
    years: [],
    usernames: [],
    wrappedUsernames: [],
    ownerUsernames: []
  };
  let t = norm(raw);
  if (!t) return { template: "", values };

  t = t.replace(/@([A-Za-z0-9_.-]{2,})/g, (m) => {
    values.usernames.push(m);
    return "@USERNAME";
  });
  t = t.replace(/\(([A-Za-z0-9_.-]{2,})\)/g, (m) => {
    values.wrappedUsernames.push(m);
    return "(USERNAME)";
  });
  t = t.replace(/^([A-Za-z0-9_.-]{2,}),\s+Owner\s+\(USERNAME\)$/i, (m, username) => {
    values.ownerUsernames.push(username);
    return "{USERNAME}, Owner (USERNAME)";
  });
  t = t.replace(/\b(19|20)\d{2}\b/g, (m) => {
    values.years.push(m);
    return "{YEAR}";
  });
  t = t.replace(/\b\d+\b/g, (m) => {
    values.numbers.push(m);
    return "{N}";
  });

  return { template: norm(t), values };
}

function fillTemplateTranslation(templateTranslated, values) {
  if (!templateTranslated) return null;
  let iN = 0;
  let iY = 0;
  let iU = 0;
  let iWU = 0;
  let iOU = 0;
  return templateTranslated
    .replace(/\{USERNAME\}/g, () => values.ownerUsernames[iOU++] ?? "{USERNAME}")
    .replace(/\{YEAR\}/g, () => values.years[iY++] ?? "{YEAR}")
    .replace(/\{N\}/g, () => values.numbers[iN++] ?? "{N}")
    .replace(/@USERNAME/g, () => values.usernames[iU++] ?? "@USERNAME")
    .replace(/\(USERNAME\)/g, () => values.wrappedUsernames[iWU++] ?? "(USERNAME)");
}

function lookupTemplateTranslation(key) {
  const { template, values } = buildTemplateLookupKey(key);
  if (!template || template === key) return null;
  const tplTranslated = translations.get(template) || translationsCI.get(template.toLowerCase()) || null;
  if (!tplTranslated) return null;
  return fillTemplateTranslation(tplTranslated, values);
}

function buildContextLookupCandidates(key) {
  const section = detectCoverageSection();
  return [
    `[${section}] ${key}`,
    `${section}:${key}`,
    key
  ];
}

function lookupTranslation(base) {
  const key = norm(base);
  if (!key) return null;
  const candidates = buildContextLookupCandidates(key);
  for (const candidate of candidates) {
    const exact = translations.get(candidate) || translationsCI.get(candidate.toLowerCase()) || null;
    if (exact) return exact;
  }
  const dynamic = applyDynamicRules(key);
  if (dynamic) return dynamic;
  for (const candidate of candidates) {
    const templated = lookupTemplateTranslation(candidate);
    if (templated) return templated;
  }
  return null;
}

function extractBaseForLookup(raw) {
  if (raw == null) return "";
  const original = String(raw);
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  const core = original.slice(leading.length, original.length - trailing.length);
  if (!core) return "";
  const m = core.match(/^(.*?)([.:\u2026!?]+)?$/);
  return norm(m?.[1] ?? core);
}

function translateStringKeepingPunctuation(raw) {
  if (raw == null) return null;

  const original = String(raw);
  const leading = original.match(/^\s*/)?.[0] ?? "";
  const trailing = original.match(/\s*$/)?.[0] ?? "";
  const core = original.slice(leading.length, original.length - trailing.length);
  if (!core) return null;

  if (isLikelyTechnicalText(core)) return null;

  const m = core.match(/^(.*?)([.:\u2026!?]+)?$/);
  const base = (m?.[1] ?? core);
  const punct = (m?.[2] ?? "");

  const translated = lookupTranslation(base);
  if (!translated) return null;

  return `${leading}${translated}${punct}${trailing}`;
}
function translateTextNode(textNode) {
  const parent = textNode.parentElement;
  if (!parent || isBlacklistedElement(parent)) return;
  if (isRepositoryCardUserContentContext(parent)) return;

  const current = textNode.nodeValue;
  if (!current || !current.trim()) return;
  if (textNode.__ghruDone) return;
  if (isRepositoryIdentityText(current, parent)) {
    textNode.__ghruDone = true;
    return;
  }
  const isUiContext = isAllowedUiContext(parent);

  const out = translateStringKeepingPunctuation(current);
  const base = extractBaseForLookup(current);
  if (!isUiContext) {
    if (out && canTranslateOutsideUi(base, parent)) {
      if (base) trackCoverageCandidate(base, parent, true);
      textNode.__ghruOrig = current;
      textNode.nodeValue = out;
      textNode.__ghruDone = true;
      return;
    }
    if (!out) {
      if (base && !lookupTranslation(base)) {
        trackCoverageCandidate(base, parent, false);
        maybeCollectUntranslated(base, parent, { enforceUiScope: false });
      }
    } else {
      if (base) trackCoverageCandidate(base, parent, true);
    }
    return;
  }

  if (!out) {
    const base = extractBaseForLookup(current);
    if (base && !lookupTranslation(base)) {
      trackCoverageCandidate(base, parent, false);
      maybeCollectUntranslated(base, parent);
    }
    return;
  }
  {
    const base = extractBaseForLookup(current);
    if (base) trackCoverageCandidate(base, parent, true);
  }
  textNode.__ghruOrig = current;
  textNode.nodeValue = out;
  textNode.__ghruDone = true;
}

function translateElementAttributes(el) {
  if (!settings.translateAttributes) return;
  if (!el || isBlacklistedElement(el)) return;
  if (isRepositoryCardUserContentContext(el)) return;
  const isUiContext = isAllowedUiContext(el);

  for (const attr of TRANSLATABLE_ATTRS) {
    if (!el.hasAttribute(attr)) continue;
    if (attr === "value") {
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (!["button", "submit", "reset"].includes(type)) continue;
      } else if (tag !== "button") {
        continue;
      }
    }
    const marker = `data-ghru-orig-${attr}`;
    if (el.hasAttribute(marker)) continue;

    const raw = el.getAttribute(attr);
    if (isRepositoryIdentityText(raw, el)) continue;
    const out = translateStringKeepingPunctuation(raw);
    const base = extractBaseForLookup(raw);
    if (!isUiContext) {
      if (out && canTranslateOutsideUi(base, el)) {
        if (base) trackCoverageCandidate(base, el, true);
        el.setAttribute(marker, raw);
        el.setAttribute(attr, norm(out));
        continue;
      }
      if (!out) {
        if (base && !lookupTranslation(base)) {
          trackCoverageCandidate(base, el, false);
          maybeCollectUntranslated(base, el, { enforceUiScope: false });
        }
      } else {
        if (base) trackCoverageCandidate(base, el, true);
      }
      continue;
    }

    if (!out) {
      if (base && !lookupTranslation(base)) {
        trackCoverageCandidate(base, el, false);
        maybeCollectUntranslated(base, el);
      }
      continue;
    }
    if (base) trackCoverageCandidate(base, el, true);

    el.setAttribute(marker, raw);
    el.setAttribute(attr, norm(out));
  }
}

function translateSubtree(root) {
  if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
  localizeRelativeTimeElements(root);
  if (isBlacklistedElement(root)) return;
  if (!isAllowedUiContext(root) && settings.strictUiOnlyMode !== false) {
    const selectors = getActiveStrictUiSelectors();
    let hasAllowedDescendant = false;
    for (const selector of selectors) {
      if (root.querySelector?.(selector)) {
        hasAllowedDescendant = true;
        break;
      }
    }
    if (!hasAllowedDescendant && !settings.collectUntranslated) return;
  }
  if (settings.translateAttributes) {
    const stack = [root];
    while (stack.length) {
      const el = stack.pop();
      if (!el || el.nodeType !== Node.ELEMENT_NODE) continue;
      if (!isBlacklistedElement(el) && (isAllowedUiContext(el) || settings.collectUntranslated)) {
        translateElementAttributes(el);
      }
      const children = el.children;
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push(children[i]);
      }
    }
  }
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (isBlacklistedElement(p)) return NodeFilter.FILTER_REJECT;
        if (isRepositoryCardUserContentContext(p)) return NodeFilter.FILTER_REJECT;
        const isUiContext = isAllowedUiContext(p);
        if (!isUiContext && !settings.collectUntranslated) return NodeFilter.FILTER_REJECT;
        const txt = n.nodeValue;
        if (!txt || !txt.trim()) return NodeFilter.FILTER_REJECT;
        if (isRepositoryIdentityText(txt, p)) return NodeFilter.FILTER_REJECT;
        if (isLikelyTechnicalText(txt)) return NodeFilter.FILTER_REJECT;
        const core = norm(txt).replace(/[.:\u2026!?]+$/, "");
        const allowOutsideUi = canTranslateOutsideUi(core, p);
        if (!isUiContext && !allowOutsideUi && !settings.collectUntranslated) return NodeFilter.FILTER_REJECT;
        const has = !!lookupTranslation(core);
        if (!has) {
          if (settings.collectUntranslated && shouldCollectCandidate(core, p, { enforceUiScope: isUiContext })) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        }
        if (!isUiContext && !allowOutsideUi) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let node;
  while ((node = walker.nextNode())) {
    translateTextNode(node);
  }
}

function revertAll() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.__ghruOrig != null) {
      node.nodeValue = node.__ghruOrig;
      delete node.__ghruOrig;
    }
    delete node.__ghruDone;
  }
  const selectors = TRANSLATABLE_ATTRS.map(a => `[data-ghru-orig-${CSS.escape(a)}]`).join(",");
  if (selectors) {
    const els = document.querySelectorAll(selectors);
    for (const el of els) {
      for (const attr of TRANSLATABLE_ATTRS) {
        const marker = `data-ghru-orig-${attr}`;
        if (!el.hasAttribute(marker)) continue;
        const orig = el.getAttribute(marker);
        if (orig == null) {
          el.removeAttribute(attr);
        } else {
          el.setAttribute(attr, orig);
        }
        el.removeAttribute(marker);
      }
    }
  }
}

function queueTranslate(node) {
  if (!settings.enabled) return;
  if (!node) return;

  const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  if (!el || isBlacklistedElement(el)) return;
  if (!isAllowedUiContext(el) && settings.strictUiOnlyMode !== false) {
    const selectors = getActiveStrictUiSelectors();
    let hasAllowedDescendant = false;
    for (const selector of selectors) {
      if (el.querySelector?.(selector)) {
        hasAllowedDescendant = true;
        break;
      }
    }
    if (!hasAllowedDescendant && !settings.collectUntranslated) return;
  }

  queue.add(el);
  if (flushTimer) return;

  flushTimer = setTimeout(() => {
    flushTimer = null;
    if (!settings.enabled) {
      queue.clear();
      return;
    }
    const batch = Array.from(queue);
    queue.clear();
    for (const item of batch) {
      if (item && item.isConnected) translateSubtree(item);
    }
  }, 80);
}

function clearQueuedTranslations() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  queue.clear();
}

function clearCoverageQueue() {
  if (coverageFlushTimer) {
    clearTimeout(coverageFlushTimer);
    coverageFlushTimer = null;
  }
  coverageTranslatedPending.clear();
  coverageUntranslatedPending.clear();
}

function clearCollectorDebugQueue() {
  if (collectorDebugFlushTimer) {
    clearTimeout(collectorDebugFlushTimer);
    collectorDebugFlushTimer = null;
  }
  collectorDebugPendingReasons.clear();
  collectorDebugPendingSamples.clear();
}

function startObserver() {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!settings.enabled) return;

    for (const m of mutations) {
      if (m.type === "childList") {
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) queueTranslate(node);
          if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
        }
      } else if (m.type === "attributes") {
        if (m.target && m.target.nodeType === Node.ELEMENT_NODE) {
          translateElementAttributes(m.target);
        }
      } else if (m.type === "characterData") {
        const n = m.target;
        if (!n || n.nodeType !== Node.TEXT_NODE) continue;
        // Ignore our own immediate text replacement mutation.
        if (n.__ghruDone && n.__ghruOrig != null && m.oldValue === n.__ghruOrig) continue;
        delete n.__ghruDone;
        delete n.__ghruOrig;
        translateTextNode(n);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS,
    characterData: true,
    characterDataOldValue: true
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  clearQueuedTranslations();
  clearCoverageQueue();
  clearCollectorDebugQueue();
  clearContextCaches();
}

function onTurboNavigation() {
  if (!settings.enabled) return;
  clearContextCaches();
  translateSubtree(document.body);
}

function attachSpaHooks() {
  if (spaHooksAttached) return;
  spaHooksAttached = true;
  document.addEventListener("turbo:load", onTurboNavigation, true);
  document.addEventListener("turbo:render", onTurboNavigation, true);
  document.addEventListener("pjax:end", onTurboNavigation, true);
}

async function init() {
  await loadUntranslated();

  buildTranslationMaps();

  if (settings.enabled) {
    translateSubtree(document.body);
    startObserver();
    attachSpaHooks();
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'ghruReload') {
      reloadSettingsFromBackground();
    } else if (msg?.type === 'ghruForceScan') {
      clearContextCaches();
      queueTranslate(document.body);
    } else if (msg?.type === "ghruBuildAutoAuditUrls") {
      sendResponse({ ok: true, urls: buildGithubCommonUrlsAuto() });
      return true;
    } else if (msg?.type === "ghruBuildUntranslatedReport") {
      const selectedText = String(window.getSelection?.()?.toString?.() || "").trim();
      sendResponse({
        ok: true,
        selectedText,
        pageUrl: String(location?.href || "")
      });
      return true;
    }
    return false;
  });
}

async function reloadSettingsFromBackground() {
  const res = await bgSend({ type: 'ghruGetSettings' });
  if (!res?.ok) return;

  const next = { ...SETTINGS_DEFAULTS, ...(res.settings || {}) };
  next.customTranslations = res.effectiveTranslations || res.customTranslations || {};
  const wasEnabled = !!settings.enabled;

  settings = next;
  clearContextCaches();
  buildTranslationMaps();

  if (wasEnabled) {
    stopObserver();
    revertAll();
  }

  if (settings.enabled) {
    translateSubtree(document.body);
    startObserver();
    attachSpaHooks();
  }
}
(async () => {
  const res = await bgSend({ type: 'ghruGetSettings' });
  if (res?.ok) {
    settings = { ...SETTINGS_DEFAULTS, ...(res.settings || {}) };
    settings.customTranslations = res.effectiveTranslations || res.customTranslations || {};
  } else {
    await new Promise((resolve) => {
      chrome.storage.sync.get(SETTINGS_DEFAULTS, (r) => {
        const syncSettings = { ...SETTINGS_DEFAULTS, ...(r || {}) };
        chrome.storage.local.get({ [LOCAL_CUSTOM_DICT_KEY]: {} }, (localRes) => {
          const custom = localRes?.[LOCAL_CUSTOM_DICT_KEY];
          if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
            syncSettings.customTranslations = custom;
          } else if (r?.customTranslations && typeof r.customTranslations === 'object' && !Array.isArray(r.customTranslations)) {
            syncSettings.customTranslations = r.customTranslations;
          }
          settings = syncSettings;
          resolve();
        });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init().catch(() => void 0); }, { once: true });
  } else {
    init().catch(() => void 0);
  }
})();
