const DEFAULTS = {
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

function $(id) {
  return document.getElementById(id);
}

function setStatus(text, ok = true) {
  const el = $("status");
  el.textContent = text;
  el.className = ok ? "ok" : "err";
  setTimeout(() => {
    el.textContent = "";
    el.className = "hint";
  }, 2500);
}

function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

function toTemplateObject(list) {
  const obj = {};
  for (const k of list) obj[k] = "";
  return obj;
}

function formatCoverageBlock(coverage) {
  const names = {
    repo_home: "repo_home",
    issues: "issues",
    pr: "pr",
    settings: "settings",
    other: "other"
  };
  const c = coverage || {};
  const sections = c.sections || {};
  const totals = c.totals || {};
  const lines = [];

  lines.push(`TOTAL: ${totals.percent ?? 0}% (${totals.translatedCount ?? 0}/${totals.total ?? 0})`);
  lines.push("");

  for (const key of ["repo_home", "issues", "pr", "settings", "other"]) {
    const row = sections[key] || {};
    lines.push(
      `${names[key]}: ${row.percent ?? 0}% (${row.translatedCount ?? 0}/${row.total ?? 0}), untranslated=${row.untranslatedCount ?? 0}`
    );
  }

  lines.push("");
  lines.push("UNTRANSLATED SAMPLE:");
  for (const key of ["repo_home", "issues", "pr", "settings", "other"]) {
    const row = sections[key] || {};
    const list = Array.isArray(row.untranslated) ? row.untranslated : [];
    lines.push(`[${names[key]}]`);
    if (!list.length) {
      lines.push("- (empty)");
      continue;
    }
    for (const item of list.slice(0, 25)) lines.push(`- ${item}`);
    if (list.length > 25) lines.push(`- ... +${list.length - 25} more`);
  }

  if (c.updatedAt) {
    lines.push("");
    lines.push(`UPDATED: ${c.updatedAt}`);
  }

  return lines.join("\n");
}

function formatCoverageSectionBlock(coverage, section) {
  const c = coverage || {};
  const row = (c.sections || {})[section] || {};
  const lines = [];
  lines.push(`[${section}]`);
  lines.push(`${row.percent ?? 0}% (${row.translatedCount ?? 0}/${row.total ?? 0})`);
  lines.push(`untranslated=${row.untranslatedCount ?? 0}`);
  lines.push("");
  lines.push("UNTRANSLATED:");
  const list = Array.isArray(row.untranslated) ? row.untranslated : [];
  if (!list.length) lines.push("- (empty)");
  else for (const item of list) lines.push(`- ${item}`);
  return lines.join("\n");
}

function formatCollectorDebugBlock(debug) {
  const d = debug || {};
  const reasons = d.reasons || {};
  const samples = d.samples || {};
  const rows = Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  const lines = [];
  lines.push(`TOTAL REASONS: ${rows.length}`);
  lines.push("");
  if (!rows.length) {
    lines.push("(empty)");
  } else {
    for (const [reason, count] of rows) {
      lines.push(`${reason}: ${count}`);
      const list = Array.isArray(samples[reason]) ? samples[reason] : [];
      for (const item of list.slice(0, 5)) lines.push(`- ${item}`);
    }
  }
  if (d.updatedAt) {
    lines.push("");
    lines.push(`UPDATED: ${d.updatedAt}`);
  }
  return lines.join("\n");
}

async function copyToClipboard(text) {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Буфер обмена недоступен в этом браузере");
  }
  await navigator.clipboard.writeText(text);
  setStatus("Скопировано", true);
}

function validateDict(dict) {
  if (dict == null) return {};
  if (typeof dict !== "object" || Array.isArray(dict)) {
    throw new Error('Ожидается JSON-объект вида { "English": "Русский" }');
  }
  const looksBroken = (s) => {
    const t = String(s || "").trim();
    if (!t) return true;
    const qCount = (t.match(/\?/g) || []).length;
    return qCount >= 3 && /^[\s?.,:;!'"`(){}\[\]\-_/\\]+$/.test(t);
  };
  const out = {};
  for (const [k, v] of Object.entries(dict)) {
    if (typeof k !== "string") continue;
    if (typeof v !== "string") throw new Error(`Значение для ключа "${k}" должно быть строкой`);
    const kk = k.trim();
    const vv = v.trim();
    if (!kk || !vv) continue;
    if (looksBroken(vv)) continue;
    out[kk] = vv;
  }
  return out;
}

function bgSend(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        const err = chrome.runtime.lastError;
        if (err) return resolve({ ok: false, error: err.message || "runtime_message_failed" });
        resolve(res);
      });
    } catch (e) {
      resolve({ ok: false, error: String(e?.message || e) });
    }
  });
}

async function loadUntranslatedInto(textarea) {
  const res = await bgSend({ type: "ghruGetUntranslated" });
  const list = Array.isArray(res?.list) ? res.list : [];
  textarea.value = prettyJson(toTemplateObject(list));
}

async function getCoverageData() {
  const res = await bgSend({ type: "ghruGetCoverage" });
  if (!res?.ok) throw new Error("Не удалось получить покрытие");
  return res.coverage;
}

async function loadCoverageInto(el) {
  try {
    const coverage = await getCoverageData();
    el.textContent = formatCoverageBlock(coverage);
  } catch {
    el.textContent = "Не удалось загрузить dashboard покрытия";
  }
}

async function loadCollectorDebugInto(el) {
  const res = await bgSend({ type: "ghruGetCollectorDebug" });
  if (!res?.ok) {
    el.textContent = "Не удалось загрузить debug коллектора";
    return;
  }
  el.textContent = formatCollectorDebugBlock(res.debug);
}

document.addEventListener("DOMContentLoaded", async () => {
  const translateAttributes = $("translateAttributes");
  const glossaryMode = $("glossaryMode");
  const collectUntranslated = $("collectUntranslated");
  const strictUiOnlyMode = $("strictUiOnlyMode");
  const collectorRelaxedMode = $("collectorRelaxedMode");
  const debugCollector = $("debugCollector");
  const modeHint = $("modeHint");
  const enableAdminMode = $("enableAdminMode");
  const disableAdminMode = $("disableAdminMode");
  const customTranslations = $("customTranslations");
  const untranslated = $("untranslated");
  const coverageDashboard = $("coverageDashboard");
  const collectorDebugDashboard = $("collectorDebugDashboard");
  const coverageSectionSelect = $("coverageSectionSelect");
  const autoAuditStatus = $("autoAuditStatus");

  let currentEnabled = true;
  let currentAdminMode = false;
  let autoAuditPollTimer = null;

  function applyAdminModeUi() {
    document.body.classList.toggle("admin-mode", !!currentAdminMode);
    if (modeHint) {
      modeHint.textContent = currentAdminMode
        ? "Режим администратора включён: доступны расширенные разделы (аудит, debug, dashboard)."
        : "Обычный режим: видны только основные настройки для пользователей.";
    }
  }

  function setAutoAuditStatusText(state) {
    if (!autoAuditStatus) return;
    if (!state?.running) {
      autoAuditStatus.textContent = "Авто-проверка: не запущена";
      return;
    }
    autoAuditStatus.textContent = `Авто-проверка: ${state.currentIndex || 0}/${state.total || 0} ${state.currentUrl || ""}`.trim();
  }

  async function refreshAutoAuditState() {
    const res = await bgSend({ type: "ghruGetAutoAuditState" });
    if (!res?.ok) return;
    setAutoAuditStatusText(res.state);
    if (!res.state?.running && autoAuditPollTimer) {
      clearInterval(autoAuditPollTimer);
      autoAuditPollTimer = null;
    }
  }

  function ensureAutoAuditPolling() {
    if (autoAuditPollTimer) return;
    autoAuditPollTimer = setInterval(() => {
      refreshAutoAuditState().catch(() => void 0);
    }, 1200);
  }

  const state = await bgSend({ type: "ghruGetSettings" });
  if (state?.ok) {
    const s = { ...DEFAULTS, ...(state.settings || {}) };
    currentEnabled = !!s.enabled;
    currentAdminMode = !!s.adminMode;
    translateAttributes.checked = !!s.translateAttributes;
    glossaryMode.checked = !!s.glossaryMode;
    collectUntranslated.checked = !!s.collectUntranslated;
    strictUiOnlyMode.checked = s.strictUiOnlyMode !== false;
    collectorRelaxedMode.checked = !!s.collectorRelaxedMode;
    debugCollector.checked = !!s.debugCollector;
    customTranslations.value = prettyJson(state.customTranslations || {});
  } else {
    chrome.storage.sync.get(DEFAULTS, (res) => {
      translateAttributes.checked = !!res.translateAttributes;
      glossaryMode.checked = !!res.glossaryMode;
      collectUntranslated.checked = !!res.collectUntranslated;
      strictUiOnlyMode.checked = res.strictUiOnlyMode !== false;
      collectorRelaxedMode.checked = !!res.collectorRelaxedMode;
      debugCollector.checked = !!res.debugCollector;
      currentAdminMode = !!res.adminMode;
      customTranslations.value = prettyJson(res.customTranslations || {});
      applyAdminModeUi();
    });
  }
  applyAdminModeUi();

  await loadUntranslatedInto(untranslated);
  await loadCoverageInto(coverageDashboard);
  await loadCollectorDebugInto(collectorDebugDashboard);
  await refreshAutoAuditState();

  $("save").addEventListener("click", async () => {
    try {
      const raw = customTranslations.value.trim();
      const parsed = raw ? JSON.parse(raw) : {};
      const dict = validateDict(parsed);
      const payloadSettings = {
        enabled: currentEnabled,
        translateAttributes: !!translateAttributes.checked,
        glossaryMode: !!glossaryMode.checked,
        collectUntranslated: !!collectUntranslated.checked,
        strictUiOnlyMode: strictUiOnlyMode.checked !== false,
        collectorRelaxedMode: !!collectorRelaxedMode.checked,
        debugCollector: !!debugCollector.checked,
        adminMode: !!currentAdminMode
      };
      const res = await bgSend({ type: "ghruSaveSettings", settings: payloadSettings, customTranslations: dict });
      if (!res?.ok) throw new Error(res?.error || "Не удалось сохранить настройки");
      setStatus("Готово", true);
    } catch (e) {
      setStatus(e?.message || "Не удалось сохранить настройки", false);
    }
  });

  $("reset").addEventListener("click", async () => {
    const res = await bgSend({
      type: "ghruSaveSettings",
      settings: {
        enabled: currentEnabled,
        translateAttributes: DEFAULTS.translateAttributes,
        glossaryMode: DEFAULTS.glossaryMode,
        collectUntranslated: DEFAULTS.collectUntranslated,
        strictUiOnlyMode: DEFAULTS.strictUiOnlyMode,
        collectorRelaxedMode: DEFAULTS.collectorRelaxedMode,
        debugCollector: DEFAULTS.debugCollector,
        adminMode: DEFAULTS.adminMode
      },
      customTranslations: {}
    });
    if (res?.ok) {
      translateAttributes.checked = DEFAULTS.translateAttributes;
      glossaryMode.checked = DEFAULTS.glossaryMode;
      collectUntranslated.checked = DEFAULTS.collectUntranslated;
      strictUiOnlyMode.checked = DEFAULTS.strictUiOnlyMode;
      collectorRelaxedMode.checked = DEFAULTS.collectorRelaxedMode;
      debugCollector.checked = DEFAULTS.debugCollector;
      currentAdminMode = DEFAULTS.adminMode;
      applyAdminModeUi();
      customTranslations.value = prettyJson({});
      setStatus("Готово", true);
    } else {
      setStatus("Ошибка", false);
    }
  });

  $("refreshUntranslated")?.addEventListener("click", async () => {
    await loadUntranslatedInto(untranslated);
    setStatus("Готово", true);
  });

  $("copyUntranslated")?.addEventListener("click", async () => {
    try {
      await copyToClipboard(untranslated.value || prettyJson({}));
    } catch (e) {
      setStatus(e?.message || "Не удалось скопировать", false);
    }
  });

  $("startAutoAudit")?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruStartAutoAudit" });
    if (!res?.ok) {
      setStatus(res?.error || "Не удалось запустить проверку", false);
      return;
    }
    ensureAutoAuditPolling();
    await refreshAutoAuditState();
    setStatus("Готово", true);
  });

  $("stopAutoAudit")?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruStopAutoAudit" });
    if (!res?.ok) {
      setStatus("Ошибка", false);
      return;
    }
    await refreshAutoAuditState();
    setStatus("Готово", true);
  });

  $("pruneUntranslated")?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruPruneUntranslated" });
    await loadUntranslatedInto(untranslated);
    if (res?.ok) setStatus("Готово", true);
    else setStatus("Ошибка", false);
  });

  $("clearUntranslated")?.addEventListener("click", async () => {
    await bgSend({ type: "ghruClearUntranslated" });
    untranslated.value = prettyJson({});
    setStatus("Готово", true);
  });

  $("refreshCoverage")?.addEventListener("click", async () => {
    await loadCoverageInto(coverageDashboard);
    setStatus("Готово", true);
  });

  $("copyCoverage")?.addEventListener("click", async () => {
    try {
      const coverage = await getCoverageData();
      await copyToClipboard(formatCoverageBlock(coverage));
    } catch (e) {
      setStatus(e?.message || "Не удалось скопировать", false);
    }
  });

  $("copyCoverageSection")?.addEventListener("click", async () => {
    try {
      const section = String(coverageSectionSelect?.value || "other");
      const coverage = await getCoverageData();
      await copyToClipboard(formatCoverageSectionBlock(coverage, section));
    } catch (e) {
      setStatus(e?.message || "Не удалось скопировать", false);
    }
  });

  $("clearCoverage")?.addEventListener("click", async () => {
    await bgSend({ type: "ghruClearCoverage" });
    await loadCoverageInto(coverageDashboard);
    setStatus("Готово", true);
  });

  $("refreshCollectorDebug")?.addEventListener("click", async () => {
    await loadCollectorDebugInto(collectorDebugDashboard);
    setStatus("Готово", true);
  });

  $("clearCollectorDebug")?.addEventListener("click", async () => {
    await bgSend({ type: "ghruClearCollectorDebug" });
    await loadCollectorDebugInto(collectorDebugDashboard);
    setStatus("Готово", true);
  });

  $("persistBundled")?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruPersistBundledDict" });
    if (res?.ok) {
      setStatus(res.changed ? "Словарь обновлён" : "Изменений нет", true);
    } else {
      setStatus(res?.error || "Не удалось сохранить словарь", false);
    }
  });

  enableAdminMode?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruSetAdminMode", adminMode: true });
    if (!res?.ok) {
      setStatus("Ошибка", false);
      return;
    }
    currentAdminMode = true;
    applyAdminModeUi();
    setStatus("Готово", true);
  });

  disableAdminMode?.addEventListener("click", async () => {
    const res = await bgSend({ type: "ghruSetAdminMode", adminMode: false });
    if (!res?.ok) {
      setStatus("Ошибка", false);
      return;
    }
    currentAdminMode = false;
    applyAdminModeUi();
    setStatus("Готово", true);
  });
});
