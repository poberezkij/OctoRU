
const SYNC_SETTINGS_KEY = 'ghru_settings_v2';
const LOCAL_CUSTOM_DICT_KEY = 'ghru_custom_dict_v2';
const LOCAL_USER_CUSTOM_DICT_KEY = 'ghru_user_custom_dict_v1';
const LOCAL_UNTRANSLATED_KEY = 'ghru_untranslated_v2';
const LOCAL_COVERAGE_KEY = 'ghru_coverage_v1';
const LOCAL_COLLECTOR_DEBUG_KEY = 'ghru_collector_debug_v1';
const SYNC_MIGRATED_KEY = 'ghru_migrated_v2';
const LOCAL_BUNDLED_DICT_VERSION_KEY = 'ghru_bundled_dict_version_v1';
const LOCAL_BUNDLED_DICT_SNAPSHOT_KEY = 'ghru_bundled_dict_snapshot_v1';
const BUNDLED_DICT_FILE = 'bundled-dictionary.json';
const BUNDLED_DICT_META_FILE = 'dict-version.json';
let bundledDictVersion = 'legacy';
const COVERAGE_SECTION_KEYS = ['repo_home', 'issues', 'pr', 'settings', 'other'];

const DEFAULT_SETTINGS = {
  enabled: true,
  translateAttributes: true,
  glossaryMode: false,
  collectUntranslated: true,
  strictUiOnlyMode: true,
  collectorRelaxedMode: false,
  debugCollector: false,
  adminMode: false
};

const GITHUB_NO_USER_CONTENT_URLS = [
  // Core / marketing
  'https://github.com/',
  'https://github.com/features',
  'https://github.com/features/actions',
  'https://github.com/features/codespaces',
  'https://github.com/features/code-review',
  'https://github.com/features/issues',
  'https://github.com/features/copilot',
  'https://github.com/features/copilot/plans',
  'https://github.com/solutions',
  'https://github.com/enterprise',
  'https://github.com/enterprise/contact',
  'https://github.com/enterprise/contact/data-residency',
  'https://github.com/organizations/enterprise_plan',
  'https://github.com/pricing',
  'https://github.com/pricing/calculator',

  // Security / trust / compliance
  'https://github.com/security',
  'https://github.com/security/advanced-security',
  'https://github.com/security/contact-sales',
  'https://github.com/trust-center/privacy',

  // Agreements / terms
  'https://github.com/customer-terms',
  'https://github.com/customer-terms/general-terms',

  // Meta / utilities
  'https://github.com/sitemap',
  'https://github.com/robots.txt',
  'https://github.com/advisories',

  // Auth
  'https://github.com/login',
  'https://github.com/join',
  'https://github.com/password_reset',

  // Settings
  'https://github.com/settings',
  'https://github.com/settings/profile',
  'https://github.com/settings/account',
  'https://github.com/settings/emails',
  'https://github.com/settings/notifications',
  'https://github.com/settings/appearance',
  'https://github.com/settings/accessibility',
  'https://github.com/settings/security',
  'https://github.com/settings/security-log',
  'https://github.com/settings/sessions',
  'https://github.com/settings/keys',
  'https://github.com/settings/tokens',
  'https://github.com/settings/applications',
  'https://github.com/settings/developers',
  'https://github.com/settings/apps',
  'https://github.com/settings/apps/new',
  'https://github.com/settings/installations',
  'https://github.com/settings/repositories',
  'https://github.com/settings/blocked_users',
  'https://github.com/settings/billing/plans',
  'https://github.com/settings/copilot',
  'https://github.com/settings/admin'
];

const AUTO_AUDIT_DEFAULT_URLS = Array.from(new Set([
  // Existing high-signal product flows
  'https://github.com/dashboard',
  'https://github.com/notifications',
  'https://github.com/pulls',
  'https://github.com/issues',
  'https://github.com/explore',
  'https://github.com/marketplace',
  'https://github.com/settings/personal-access-tokens',
  'https://github.com/settings/organizations',
  'https://github.com/settings/billing',

  // Extended no-UGC surface
  ...GITHUB_NO_USER_CONTENT_URLS
]));

const autoAuditState = {
  running: false,
  stopRequested: false,
  currentIndex: 0,
  total: 0,
  currentUrl: '',
  startedAt: '',
  finishedAt: '',
  tabId: null
};

function storageGet(area, defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].get(defaults, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || `storage.${area}.get_failed`));
        return;
      }
      resolve(res || defaults);
    });
  });
}

function storageSet(area, obj) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].set(obj, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || `storage.${area}.set_failed`));
        return;
      }
      resolve();
    });
  });
}

function storageRemove(area, keys) {
  return new Promise((resolve, reject) => {
    chrome.storage[area].remove(keys, () => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || `storage.${area}.remove_failed`));
        return;
      }
      resolve();
    });
  });
}

function normalizeTranslationsDict(dict) {
  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) return {};
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    if (typeof k !== 'string' || typeof v !== 'string') continue;
    const kk = k.trim();
    const vv = v.trim();
    if (!kk || !vv) continue;
    out[kk] = vv;
  }
  return out;
}

function normalizeCoverageSection(section) {
  const s = String(section || '').trim().toLowerCase();
  return COVERAGE_SECTION_KEYS.includes(s) ? s : 'other';
}

function normalizeCoveragePayload(payload) {
  const out = {};
  for (const section of COVERAGE_SECTION_KEYS) {
    out[section] = { translated: [], untranslated: [] };
  }
  if (!payload || typeof payload !== 'object') {
    return { sections: out, updatedAt: '' };
  }

  const sections = payload.sections && typeof payload.sections === 'object' ? payload.sections : {};
  for (const [rawSection, rawValue] of Object.entries(sections)) {
    const section = normalizeCoverageSection(rawSection);
    const value = rawValue && typeof rawValue === 'object' ? rawValue : {};
    const translated = Array.isArray(value.translated) ? value.translated : [];
    const untranslated = Array.isArray(value.untranslated) ? value.untranslated : [];

    const tSet = new Set();
    const uSet = new Set();
    for (const item of translated) {
      if (typeof item !== 'string') continue;
      const v = item.trim();
      if (!v) continue;
      tSet.add(v);
    }
    for (const item of untranslated) {
      if (typeof item !== 'string') continue;
      const v = item.trim();
      if (!v) continue;
      uSet.add(v);
    }
    out[section] = {
      translated: Array.from(tSet).sort(),
      untranslated: Array.from(uSet).sort()
    };
  }

  return {
    sections: out,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : ''
  };
}

function normalizeCoverageItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  const seen = new Set();
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    if (!key) continue;
    const section = normalizeCoverageSection(row.section);
    const sig = `${section}\u0000${key}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push({ section, key });
  }
  return out;
}

function mergeCoverage(current, translatedItems, untranslatedItems) {
  const data = normalizeCoveragePayload(current);
  const MAX = 5000;

  for (const section of COVERAGE_SECTION_KEYS) {
    const row = data.sections[section];
    const tSet = new Set(row.translated);
    const uSet = new Set(row.untranslated);

    for (const item of translatedItems) {
      if (item.section !== section) continue;
      tSet.add(item.key);
      uSet.delete(item.key);
    }
    for (const item of untranslatedItems) {
      if (item.section !== section) continue;
      if (!tSet.has(item.key)) uSet.add(item.key);
    }

    const translated = Array.from(tSet).sort();
    const untranslated = Array.from(uSet).sort();
    if (translated.length > MAX) translated.length = MAX;
    if (untranslated.length > MAX) untranslated.length = MAX;
    data.sections[section] = { translated, untranslated };
  }

  data.updatedAt = new Date().toISOString();
  return data;
}

function buildCoverageSummary(payload) {
  const data = normalizeCoveragePayload(payload);
  const sections = {};
  let totalTranslated = 0;
  let totalUntranslated = 0;

  for (const section of COVERAGE_SECTION_KEYS) {
    const translatedCount = data.sections[section].translated.length;
    const untranslatedCount = data.sections[section].untranslated.length;
    const total = translatedCount + untranslatedCount;
    const percent = total ? Math.round((translatedCount / total) * 100) : 100;
    sections[section] = {
      translatedCount,
      untranslatedCount,
      total,
      percent,
      untranslated: data.sections[section].untranslated
    };
    totalTranslated += translatedCount;
    totalUntranslated += untranslatedCount;
  }

  const total = totalTranslated + totalUntranslated;
  return {
    sections,
    totals: {
      translatedCount: totalTranslated,
      untranslatedCount: totalUntranslated,
      total,
      percent: total ? Math.round((totalTranslated / total) * 100) : 100
    },
    updatedAt: data.updatedAt || ''
  };
}

function normalizeCollectorDebugPayload(payload) {
  const map = {};
  if (!payload || typeof payload !== 'object') {
    return { reasons: map, samples: {}, updatedAt: '' };
  }

  const reasons = payload.reasons && typeof payload.reasons === 'object' ? payload.reasons : {};
  const samples = payload.samples && typeof payload.samples === 'object' ? payload.samples : {};
  const outSamples = {};

  for (const [reason, countRaw] of Object.entries(reasons)) {
    const reasonKey = String(reason || '').trim();
    if (!reasonKey) continue;
    const count = Number(countRaw);
    if (!Number.isFinite(count) || count <= 0) continue;
    map[reasonKey] = Math.floor(count);

    const sampleListRaw = Array.isArray(samples[reasonKey]) ? samples[reasonKey] : [];
    const sampleSet = new Set();
    for (const item of sampleListRaw) {
      if (typeof item !== 'string') continue;
      const v = item.trim();
      if (!v) continue;
      sampleSet.add(v);
      if (sampleSet.size >= 20) break;
    }
    outSamples[reasonKey] = Array.from(sampleSet);
  }

  return {
    reasons: map,
    samples: outSamples,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : ''
  };
}

function mergeCollectorDebug(current, incoming) {
  const now = new Date().toISOString();
  const left = normalizeCollectorDebugPayload(current);
  const right = normalizeCollectorDebugPayload(incoming);
  const reasons = { ...left.reasons };
  const samples = { ...left.samples };

  for (const [reason, count] of Object.entries(right.reasons)) {
    reasons[reason] = (reasons[reason] || 0) + count;
    const set = new Set(Array.isArray(samples[reason]) ? samples[reason] : []);
    const incomingSamples = Array.isArray(right.samples[reason]) ? right.samples[reason] : [];
    for (const item of incomingSamples) {
      if (typeof item !== 'string') continue;
      const v = item.trim();
      if (!v) continue;
      set.add(v);
      if (set.size >= 20) break;
    }
    samples[reason] = Array.from(set);
  }

  return { reasons, samples, updatedAt: now };
}

function dictsEqual(a, b) {
  const aa = normalizeTranslationsDict(a);
  const bb = normalizeTranslationsDict(b);
  const aKeys = Object.keys(aa);
  const bKeys = Object.keys(bb);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (aa[k] !== bb[k]) return false;
  }
  return true;
}

function shouldDropUntranslatedNoise(key) {
  const t = String(key || '').trim();
  if (!t) return true;

  if (t.length < 2) return true;

  // Keep long natural text (including Marketplace/Models descriptions),
  // but drop clearly technical blobs and tokens.
  if (t.length > 8000) return true;

  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(t)) return true;
  if (/^[\W_]+$/u.test(t)) return true;
  if (/^\p{Extended_Pictographic}+$/u.test(t)) return true;

  // Placeholders and synthetic collector tokens.
  if (/^\{[A-Z_][A-Z0-9_]*\}$/i.test(t)) return true;
  if (/^\(\s*\{[A-Z_][A-Z0-9_]*\}\s*\)$/i.test(t)) return true;
  if ((t.match(/\{[A-Z_][A-Z0-9_]*\}/gi) || []).length >= 4 && t.length < 120) return true;

  // HTML/CSS/serialized payload noise.
  if (/<\/?[a-z][\s\S]*>/i.test(t)) return true;
  if (/data:image\/[a-z0-9+.-]+;base64,/i.test(t)) return true;
  if (/(^|[;{])\s*[.#]?[A-Za-z0-9_-]+\s*\{[^}]*:[^}]*\}/.test(t)) return true;
  if (/^(\{|\[)[\s\S]*(:|\"|\])[\s\S]*(\}|\])$/.test(t) && /\"[A-Za-z0-9_.-]+\"\s*:/.test(t)) return true;

  // Random ids, hashes, long opaque tokens.
  if (/^[A-F0-9]{16,}$/i.test(t)) return true;
  if (/^[A-Za-z0-9+/=_-]{24,}$/.test(t) && !/\s/.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return true;

  // Query syntax and repository refs are not translation targets.
  if (/\b(?:repo|org|user|is|state|sort|lang|created):/i.test(t)) return true;
  if (/\b[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\b/.test(t)) return true;
  if (/@[A-Za-z0-9_.-]{2,}/.test(t)) return true;

  // Single-token technical crumbs.
  if (/^\S+$/.test(t) && /[+#*=]/.test(t) && t.length < 80) return true;

  return false;
}

async function loadBundledCustomDict() {
  const url = chrome.runtime.getURL(BUNDLED_DICT_FILE);
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`bundled_dict_fetch_failed_${resp.status}`);
  }
  const json = await resp.json();
  return normalizeTranslationsDict(json);
}

async function loadBundledDictVersion() {
  try {
    const url = chrome.runtime.getURL(BUNDLED_DICT_META_FILE);
    const resp = await fetch(url);
    if (!resp.ok) return bundledDictVersion;
    const json = await resp.json();
    const next = typeof json?.version === 'string' ? json.version.trim() : '';
    if (next) bundledDictVersion = next;
    return bundledDictVersion;
  } catch (e) {
    return bundledDictVersion;
  }
}

async function ensureBundledCustomDict() {
  const currentVersion = await loadBundledDictVersion();
  const localRes = await storageGet('local', {
    [LOCAL_CUSTOM_DICT_KEY]: {},
    [LOCAL_USER_CUSTOM_DICT_KEY]: {},
    [LOCAL_BUNDLED_DICT_VERSION_KEY]: '',
    [LOCAL_BUNDLED_DICT_SNAPSHOT_KEY]: {}
  });

  const existing = normalizeTranslationsDict(localRes[LOCAL_CUSTOM_DICT_KEY]);
  const storedUser = normalizeTranslationsDict(localRes[LOCAL_USER_CUSTOM_DICT_KEY]);
  const snapshot = normalizeTranslationsDict(localRes[LOCAL_BUNDLED_DICT_SNAPSHOT_KEY]);
  const bundled = await loadBundledCustomDict();

  let userOverrides = { ...storedUser };
  if (!Object.keys(userOverrides).length && Object.keys(existing).length) {
    if (Object.keys(snapshot).length) {
      for (const [k, v] of Object.entries(existing)) {
        if (!Object.prototype.hasOwnProperty.call(snapshot, k) || snapshot[k] !== v) {
          userOverrides[k] = v;
        }
      }
    } else if (Object.keys(existing).length > 100) {
      for (const [k, v] of Object.entries(existing)) {
        if (!Object.prototype.hasOwnProperty.call(bundled, k)) {
          userOverrides[k] = v;
        }
      }
    } else {
      userOverrides = existing;
    }
  }

  const merged = { ...bundled, ...userOverrides };
  const dictChanged = !dictsEqual(merged, existing);
  const userChanged = !dictsEqual(userOverrides, storedUser);
  const snapshotChanged = !dictsEqual(snapshot, bundled);
  const versionChanged = localRes[LOCAL_BUNDLED_DICT_VERSION_KEY] !== currentVersion;

  const payload = {
    [LOCAL_BUNDLED_DICT_VERSION_KEY]: currentVersion
  };

  if (snapshotChanged || versionChanged) {
    payload[LOCAL_BUNDLED_DICT_SNAPSHOT_KEY] = bundled;
  }
  if (userChanged) {
    payload[LOCAL_USER_CUSTOM_DICT_KEY] = userOverrides;
  }
  if (dictChanged) {
    payload[LOCAL_CUSTOM_DICT_KEY] = merged;
  }

  await storageSet('local', payload);
  return dictChanged || userChanged;
}

async function tryEnsureBundledCustomDict() {
  try {
    return await ensureBundledCustomDict();
  } catch (e) {
    return false;
  }
}

async function getState() {
  const syncRes = await storageGet('sync', { [SYNC_SETTINGS_KEY]: DEFAULT_SETTINGS });
  const settings = { ...DEFAULT_SETTINGS, ...(syncRes[SYNC_SETTINGS_KEY] || {}) };

  const localRes = await storageGet('local', {
    [LOCAL_CUSTOM_DICT_KEY]: {},
    [LOCAL_USER_CUSTOM_DICT_KEY]: {},
    [LOCAL_UNTRANSLATED_KEY]: [],
    [LOCAL_COVERAGE_KEY]: {},
    [LOCAL_COLLECTOR_DEBUG_KEY]: {}
  });

  const customTranslations = normalizeTranslationsDict(localRes[LOCAL_USER_CUSTOM_DICT_KEY]);
  const effectiveTranslations = normalizeTranslationsDict(localRes[LOCAL_CUSTOM_DICT_KEY]);
  const untranslated = Array.isArray(localRes[LOCAL_UNTRANSLATED_KEY]) ? localRes[LOCAL_UNTRANSLATED_KEY] : [];
  const coverage = normalizeCoveragePayload(localRes[LOCAL_COVERAGE_KEY]);
  const collectorDebug = normalizeCollectorDebugPayload(localRes[LOCAL_COLLECTOR_DEBUG_KEY]);

  return { settings, customTranslations, effectiveTranslations, untranslated, coverage, collectorDebug };
}

async function broadcastToGitHubTabs(message) {
  try {
    chrome.tabs.query({ url: ['https://github.com/*', 'https://gist.github.com/*'] }, (tabs) => {
      for (const t of tabs || []) {
        if (!t?.id) continue;
        chrome.tabs.sendMessage(t.id, message, () => void chrome.runtime.lastError);
      }
    });
  } catch (e) {
  }
}

async function setBadge(isEnabled) {
  try {
    if (chrome.action?.setBadgeText) {
      await chrome.action.setBadgeText({ text: '' });
    }
    if (chrome.action?.setTitle) {
      await chrome.action.setTitle({
        title: isEnabled ? 'OctoRU — GitHub на русском (включено)' : 'OctoRU — GitHub на русском (выключено)'
      });
    }
  } catch (e) {
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tabsCreate(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'tabs_create_failed'));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsUpdate(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'tabs_update_failed'));
        return;
      }
      resolve(tab);
    });
  });
}

function tabsRemove(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function tabsSendMessage(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, () => resolve());
  });
}

function tabsSendMessageWithResponse(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(res || null);
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => resolve(Array.isArray(tabs) ? tabs : []));
  });
}

function waitTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => finish(), timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId !== tabId) return;
      if (changeInfo?.status === 'complete') finish();
    };
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function getAutoAuditState() {
  return {
    running: autoAuditState.running,
    currentIndex: autoAuditState.currentIndex,
    total: autoAuditState.total,
    currentUrl: autoAuditState.currentUrl,
    startedAt: autoAuditState.startedAt,
    finishedAt: autoAuditState.finishedAt
  };
}

function normalizeAutoAuditUrls(urls) {
  const src = Array.isArray(urls) && urls.length ? urls : AUTO_AUDIT_DEFAULT_URLS;
  const out = [];
  const seen = new Set();
  for (const raw of src) {
    const u = String(raw || '').trim();
    if (!u) continue;
    if (!/^https:\/\/(github\.com|gist\.github\.com)\//i.test(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

async function buildAutoAuditUrlsFromActiveTab() {
  const tabs = await tabsQuery({
    active: true,
    currentWindow: true,
    url: ['https://github.com/*', 'https://gist.github.com/*']
  });
  const active = tabs.find((t) => t && typeof t.id === 'number');
  if (!active?.id) return [];
  const res = await tabsSendMessageWithResponse(active.id, { type: 'ghruBuildAutoAuditUrls' });
  if (!res?.ok || !Array.isArray(res.urls)) return [];
  return normalizeAutoAuditUrls(res.urls);
}

async function resolveAutoAuditUrls(requestedUrls) {
  const explicit = normalizeAutoAuditUrls(requestedUrls);
  if (explicit.length) return explicit;

  const dynamic = await buildAutoAuditUrlsFromActiveTab();
  if (!dynamic.length) return normalizeAutoAuditUrls(AUTO_AUDIT_DEFAULT_URLS);

  return normalizeAutoAuditUrls([...dynamic, ...AUTO_AUDIT_DEFAULT_URLS]);
}

async function runAutoAudit(urls, dwellMs) {
  const waitMs = Math.max(1500, Math.min(15000, Number(dwellMs) || 3500));
  autoAuditState.running = true;
  autoAuditState.stopRequested = false;
  autoAuditState.currentIndex = 0;
  autoAuditState.total = urls.length;
  autoAuditState.currentUrl = '';
  autoAuditState.startedAt = new Date().toISOString();
  autoAuditState.finishedAt = '';
  autoAuditState.tabId = null;

  let tabId = null;
  try {
    const first = await tabsCreate({ url: urls[0], active: false });
    tabId = first?.id || null;
    autoAuditState.tabId = tabId;
    for (let i = 0; i < urls.length; i++) {
      if (autoAuditState.stopRequested) break;
      const url = urls[i];
      autoAuditState.currentIndex = i + 1;
      autoAuditState.currentUrl = url;
      if (i > 0 && tabId != null) {
        await tabsUpdate(tabId, { url, active: false });
      }
      if (tabId != null) {
        await waitTabComplete(tabId, 20000);
        await tabsSendMessage(tabId, { type: 'ghruForceScan' });
      }
      await sleep(waitMs);
    }
  } finally {
    if (tabId != null) {
      await tabsRemove(tabId);
    }
    autoAuditState.running = false;
    autoAuditState.stopRequested = false;
    autoAuditState.currentUrl = '';
    autoAuditState.tabId = null;
    autoAuditState.finishedAt = new Date().toISOString();
  }
}

async function ensureDefaults() {
  const syncRes = await storageGet('sync', { [SYNC_SETTINGS_KEY]: null });
  if (!syncRes[SYNC_SETTINGS_KEY]) {
    await storageSet('sync', { [SYNC_SETTINGS_KEY]: DEFAULT_SETTINGS });
  }

  const { settings } = await getState();
  await setBadge(!!settings.enabled);
}

async function migrateFromV13() {
  const syncRes = await storageGet('sync', {
    [SYNC_MIGRATED_KEY]: false,
    enabled: undefined,
    translateAttributes: undefined,
    glossaryMode: undefined,
    collectUntranslated: undefined,
    strictUiOnlyMode: undefined,
    collectorRelaxedMode: undefined,
    customTranslations: undefined
  });

  if (syncRes[SYNC_MIGRATED_KEY]) {
    await ensureDefaults();
    const dictChanged = await tryEnsureBundledCustomDict();
    if (dictChanged) {
      await broadcastToGitHubTabs({ type: 'ghruReload' });
    }
    return;
  }

  const legacySettings = {};
  if (typeof syncRes.enabled === 'boolean') legacySettings.enabled = syncRes.enabled;
  if (typeof syncRes.translateAttributes === 'boolean') legacySettings.translateAttributes = syncRes.translateAttributes;
  if (typeof syncRes.glossaryMode === 'boolean') legacySettings.glossaryMode = syncRes.glossaryMode;
  if (typeof syncRes.collectUntranslated === 'boolean') legacySettings.collectUntranslated = syncRes.collectUntranslated;
  if (typeof syncRes.strictUiOnlyMode === 'boolean') legacySettings.strictUiOnlyMode = syncRes.strictUiOnlyMode;
  if (typeof syncRes.collectorRelaxedMode === 'boolean') legacySettings.collectorRelaxedMode = syncRes.collectorRelaxedMode;

  await storageSet('sync', { [SYNC_SETTINGS_KEY]: { ...DEFAULT_SETTINGS, ...legacySettings }, [SYNC_MIGRATED_KEY]: true });

  if (syncRes.customTranslations && typeof syncRes.customTranslations === 'object' && !Array.isArray(syncRes.customTranslations)) {
    await storageSet('local', {
      [LOCAL_USER_CUSTOM_DICT_KEY]: normalizeTranslationsDict(syncRes.customTranslations)
    });
    await storageRemove('sync', ['customTranslations']);
  }

  const oldLocal = await storageGet('local', { ghru_untranslated: [] });
  if (Array.isArray(oldLocal.ghru_untranslated) && oldLocal.ghru_untranslated.length) {
    await storageSet('local', { [LOCAL_UNTRANSLATED_KEY]: oldLocal.ghru_untranslated });
    await storageRemove('local', ['ghru_untranslated']);
  }

  await ensureDefaults();
  await tryEnsureBundledCustomDict();
  await broadcastToGitHubTabs({ type: 'ghruReload' });
}

chrome.runtime.onInstalled.addListener(() => {
  migrateFromV13().catch(() => void 0);
});

chrome.runtime.onStartup?.addListener(() => {
  (async () => {
    await ensureDefaults();
    const dictChanged = await tryEnsureBundledCustomDict();
    if (dictChanged) {
      await broadcastToGitHubTabs({ type: 'ghruReload' });
    }
  })().catch(() => void 0);
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    const type = req?.type;

    if (type === 'ghruGetState') {
      await tryEnsureBundledCustomDict();
      const { settings, customTranslations, effectiveTranslations, untranslated, coverage, collectorDebug } = await getState();
      sendResponse({
        ok: true,
        settings,
        customTranslations,
        effectiveTranslations,
        untranslatedCount: untranslated.length,
        coverage: buildCoverageSummary(coverage),
        collectorDebug
      });
      return;
    }

    if (type === 'ghruGetSettings') {
      await tryEnsureBundledCustomDict();
      const { settings, customTranslations, effectiveTranslations } = await getState();
      sendResponse({ ok: true, settings, customTranslations, effectiveTranslations });
      return;
    }

    if (type === 'ghruToggleEnabled') {
      const enabled = !!req?.enabled;
      const syncRes = await storageGet('sync', { [SYNC_SETTINGS_KEY]: DEFAULT_SETTINGS });
      const next = { ...DEFAULT_SETTINGS, ...(syncRes[SYNC_SETTINGS_KEY] || {}), enabled };
      await storageSet('sync', { [SYNC_SETTINGS_KEY]: next });
      await setBadge(enabled);
      await broadcastToGitHubTabs({ type: 'ghruReload' });
      sendResponse({ ok: true, enabled });
      return;
    }

    if (type === 'ghruSaveSettings') {
      const incoming = req?.settings || {};
      const customTranslations = req?.customTranslations;

      const cleaned = {
        enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : DEFAULT_SETTINGS.enabled,
        translateAttributes: !!incoming.translateAttributes,
        glossaryMode: !!incoming.glossaryMode,
        collectUntranslated: !!incoming.collectUntranslated,
        strictUiOnlyMode: incoming.strictUiOnlyMode !== false,
        collectorRelaxedMode: !!incoming.collectorRelaxedMode,
        debugCollector: !!incoming.debugCollector,
        adminMode: !!incoming.adminMode
      };

      await storageSet('sync', { [SYNC_SETTINGS_KEY]: cleaned });
      if (customTranslations !== undefined) {
        if (!customTranslations || typeof customTranslations !== 'object' || Array.isArray(customTranslations)) {
          throw new Error('invalid_custom_translations');
        }
        const userDict = normalizeTranslationsDict(customTranslations);
        let bundled = {};
        try {
          bundled = await loadBundledCustomDict();
        } catch (e) {
          bundled = {};
        }
        const currentVersion = await loadBundledDictVersion();
        const effective = { ...bundled, ...userDict };
        await storageSet('local', {
          [LOCAL_USER_CUSTOM_DICT_KEY]: userDict,
          [LOCAL_CUSTOM_DICT_KEY]: effective,
          [LOCAL_BUNDLED_DICT_SNAPSHOT_KEY]: bundled,
          [LOCAL_BUNDLED_DICT_VERSION_KEY]: currentVersion
        });
      }

      await setBadge(!!cleaned.enabled);
      await broadcastToGitHubTabs({ type: 'ghruReload' });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruSetAdminMode') {
      const syncRes = await storageGet('sync', { [SYNC_SETTINGS_KEY]: DEFAULT_SETTINGS });
      const next = {
        ...DEFAULT_SETTINGS,
        ...(syncRes[SYNC_SETTINGS_KEY] || {}),
        adminMode: !!req?.adminMode
      };
      await storageSet('sync', { [SYNC_SETTINGS_KEY]: next });
      sendResponse({ ok: true, adminMode: next.adminMode });
      return;
    }

    if (type === 'ghruGetUntranslated') {
      const localRes = await storageGet('local', { [LOCAL_UNTRANSLATED_KEY]: [] });
      const list = Array.isArray(localRes[LOCAL_UNTRANSLATED_KEY]) ? localRes[LOCAL_UNTRANSLATED_KEY] : [];
      sendResponse({ ok: true, list });
      return;
    }

    if (type === 'ghruGetCoverage') {
      const localRes = await storageGet('local', { [LOCAL_COVERAGE_KEY]: {} });
      const coverage = buildCoverageSummary(localRes[LOCAL_COVERAGE_KEY]);
      sendResponse({ ok: true, coverage });
      return;
    }

    if (type === 'ghruGetCollectorDebug') {
      const localRes = await storageGet('local', { [LOCAL_COLLECTOR_DEBUG_KEY]: {} });
      const debug = normalizeCollectorDebugPayload(localRes[LOCAL_COLLECTOR_DEBUG_KEY]);
      sendResponse({ ok: true, debug });
      return;
    }

    if (type === 'ghruClearUntranslated') {
      await storageSet('local', { [LOCAL_UNTRANSLATED_KEY]: [] });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruPruneUntranslated') {
      const localRes = await storageGet('local', { [LOCAL_UNTRANSLATED_KEY]: [] });
      const list = Array.isArray(localRes[LOCAL_UNTRANSLATED_KEY]) ? localRes[LOCAL_UNTRANSLATED_KEY] : [];
      const before = list.length;
      const next = list.filter((k) => !shouldDropUntranslatedNoise(k));
      await storageSet('local', { [LOCAL_UNTRANSLATED_KEY]: next });
      sendResponse({ ok: true, before, after: next.length, removed: before - next.length });
      return;
    }

    if (type === 'ghruClearCoverage') {
      await storageSet('local', { [LOCAL_COVERAGE_KEY]: normalizeCoveragePayload({}) });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruClearCollectorDebug') {
      await storageSet('local', { [LOCAL_COLLECTOR_DEBUG_KEY]: normalizeCollectorDebugPayload({}) });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruReportUntranslated') {
      const items = Array.isArray(req?.items) ? req.items : [];
      if (!items.length) {
        sendResponse({ ok: true });
        return;
      }

      const localRes = await storageGet('local', { [LOCAL_UNTRANSLATED_KEY]: [] });
      const existing = Array.isArray(localRes[LOCAL_UNTRANSLATED_KEY]) ? localRes[LOCAL_UNTRANSLATED_KEY] : [];
      const set = new Set(existing);
      for (const s of items) {
        if (typeof s === 'string' && s.trim()) set.add(s.trim());
      }

      const MAX = 8000;
      const next = Array.from(set).sort();
      if (next.length > MAX) next.length = MAX;

      await storageSet('local', { [LOCAL_UNTRANSLATED_KEY]: next });
      sendResponse({ ok: true, count: next.length });
      return;
    }

    if (type === 'ghruReportCoverage') {
      const translatedItems = normalizeCoverageItems(req?.translated);
      const untranslatedItems = normalizeCoverageItems(req?.untranslated);
      if (!translatedItems.length && !untranslatedItems.length) {
        sendResponse({ ok: true });
        return;
      }

      const localRes = await storageGet('local', { [LOCAL_COVERAGE_KEY]: {} });
      const merged = mergeCoverage(localRes[LOCAL_COVERAGE_KEY], translatedItems, untranslatedItems);
      await storageSet('local', { [LOCAL_COVERAGE_KEY]: merged });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruReportCollectorDebug') {
      const incoming = req?.payload;
      const localRes = await storageGet('local', { [LOCAL_COLLECTOR_DEBUG_KEY]: {} });
      const merged = mergeCollectorDebug(localRes[LOCAL_COLLECTOR_DEBUG_KEY], incoming);
      await storageSet('local', { [LOCAL_COLLECTOR_DEBUG_KEY]: merged });
      sendResponse({ ok: true });
      return;
    }

    if (type === 'ghruPersistBundledDict') {
      const changed = await tryEnsureBundledCustomDict();
      if (changed) {
        await broadcastToGitHubTabs({ type: 'ghruReload' });
      }
      sendResponse({ ok: true, changed });
      return;
    }

    if (type === 'ghruGetAutoAuditState') {
      sendResponse({ ok: true, state: getAutoAuditState() });
      return;
    }

    if (type === 'ghruStopAutoAudit') {
      autoAuditState.stopRequested = true;
      sendResponse({ ok: true, state: getAutoAuditState() });
      return;
    }

    if (type === 'ghruStartAutoAudit') {
      if (autoAuditState.running) {
        sendResponse({ ok: false, error: 'auto_audit_already_running', state: getAutoAuditState() });
        return;
      }
      const urls = await resolveAutoAuditUrls(req?.urls);
      if (!urls.length) {
        sendResponse({ ok: false, error: 'auto_audit_no_urls' });
        return;
      }
      const dwellMs = Number(req?.dwellMs) || 3500;
      const syncRes = await storageGet('sync', { [SYNC_SETTINGS_KEY]: DEFAULT_SETTINGS });
      const current = { ...DEFAULT_SETTINGS, ...(syncRes[SYNC_SETTINGS_KEY] || {}) };
      const next = {
        ...current,
        collectUntranslated: true,
        collectorRelaxedMode: true
      };
      await storageSet('sync', { [SYNC_SETTINGS_KEY]: next });
      await broadcastToGitHubTabs({ type: 'ghruReload' });
      runAutoAudit(urls, dwellMs).catch(() => void 0);
      sendResponse({ ok: true, state: getAutoAuditState() });
      return;
    }

    sendResponse({ ok: false, error: 'unknown_message' });
  })().catch((e) => {
    sendResponse({ ok: false, error: String(e?.message || e) });
  });

  return true; // Оставляем канал открытым для асинхронного sendResponse.
});

