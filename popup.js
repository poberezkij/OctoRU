document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');
  const openOptions = document.getElementById('openOptions');
  const reportUntranslated = document.getElementById('reportUntranslated');

  function showReportStatus(text, timeout = 1800) {
    if (!reportUntranslated) return;
    reportUntranslated.textContent = text;
    setTimeout(() => {
      reportUntranslated.textContent = 'Сообщить о непереведенном тексте';
    }, timeout);
  }

  function setUi(isEnabled) {
    toggle.checked = isEnabled;
    status.textContent = isEnabled ? 'Активен' : 'Неактивен';
    status.dataset.state = isEnabled ? 'on' : 'off';
  }

  chrome.runtime.sendMessage({ type: 'ghruGetSettings' }, (res) => {
    if (!res?.ok) {
      // Резервное чтение настроек, если background недоступен.
      chrome.storage.sync.get({ enabled: true }, (r) => setUi(!!r.enabled));
      return;
    }
    setUi(!!res.settings?.enabled);
  });

  toggle.addEventListener('change', () => {
    const isEnabled = !!toggle.checked;
    setUi(isEnabled);
    chrome.runtime.sendMessage({ type: 'ghruToggleEnabled', enabled: isEnabled }, () => void chrome.runtime.lastError);
  });

  openOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
  });

  reportUntranslated?.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = (tabs || [])[0];
      const tabId = tab?.id;
      const url = tab?.url || 'https://github.com/';
      if (!tabId) {
        showReportStatus('Не удалось определить вкладку');
        return;
      }

      chrome.tabs.sendMessage(tabId, { type: 'ghruBuildUntranslatedReport' }, async (res) => {
        const issue = globalThis.OctoRUReport?.buildUntranslatedIssue(
          res?.selectedText,
          res?.pageUrl || url,
          navigator.userAgent
        );
        if (!issue) {
          showReportStatus('Сначала выделите текст', 2400);
          return;
        }

        try {
          await navigator.clipboard.writeText(issue.reportText);
          chrome.tabs.create({ url: issue.issueUrl });
          showReportStatus('Скопировано', 1200);
        } catch {
          showReportStatus('Не удалось скопировать');
        }
      });
    });
  });
});
