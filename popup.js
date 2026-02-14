document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');
  const openOptions = document.getElementById('openOptions');
  const reportUntranslated = document.getElementById('reportUntranslated');

  function setUi(isEnabled) {
    toggle.checked = isEnabled;
    status.textContent = isEnabled ? '\u0410\u043a\u0442\u0438\u0432\u0435\u043d' : '\u041d\u0435\u0430\u043a\u0442\u0438\u0432\u0435\u043d';
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
      if (!tabId) return;

      chrome.tabs.sendMessage(tabId, { type: 'ghruBuildUntranslatedReport' }, async (res) => {
        const selected = (res?.selectedText || '').trim();
        const reportText = [
          'Непереведённый текст:',
          selected || '<вставьте текст>',
          '',
          'Страница:',
          url
        ].join('\n');

        try {
          await navigator.clipboard.writeText(reportText);
          reportUntranslated.textContent = 'Скопировано';
          setTimeout(() => {
            reportUntranslated.textContent = 'Сообщить о непереведенном тексте';
          }, 1200);
        } catch {
          reportUntranslated.textContent = 'Не удалось скопировать';
          setTimeout(() => {
            reportUntranslated.textContent = 'Сообщить о непереведенном тексте';
          }, 1200);
        }
      });
    });
  });
});

