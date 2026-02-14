document.addEventListener('DOMContentLoaded', () => {
  const MAINTAINER_PROFILE_URL = 'https://github.com/poberezkij';
  const REPO_ISSUES_NEW_URL = 'https://github.com/poberezkij/OctoRU/issues/new';

  const toggle = document.getElementById('toggle');
  const status = document.getElementById('status');
  const openOptions = document.getElementById('openOptions');
  const reportUntranslated = document.getElementById('reportUntranslated');

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
      if (!tabId) return;

      chrome.tabs.sendMessage(tabId, { type: 'ghruBuildUntranslatedReport' }, async (res) => {
        const selected = String(res?.selectedText || '').trim();
        const safeSelected = selected || '<вставьте текст>';

        const reportText = [
          'Непереведённый текст:',
          safeSelected,
          '',
          'Страница:',
          url,
          '',
          'Профиль:',
          MAINTAINER_PROFILE_URL
        ].join('\n');

        // Формируем ссылку для создания Issue с заранее заполненным шаблоном.
        const issueTitle = `Непереведённый текст: ${safeSelected.slice(0, 60)}`;
        const issueBody = `${reportText}\n\nДополнительно:\n- Браузер: ${navigator.userAgent}`;
        const issueUrl = `${REPO_ISSUES_NEW_URL}?${new URLSearchParams({
          title: issueTitle,
          body: issueBody
        }).toString()}`;

        try {
          await navigator.clipboard.writeText(reportText);
          chrome.tabs.create({ url: issueUrl });
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
