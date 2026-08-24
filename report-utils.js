(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OctoRUReport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const REPO_ISSUES_NEW_URL = "https://github.com/poberezkij/OctoRU/issues/new";

  function buildUntranslatedIssue(selectedText, pageUrl, userAgent) {
    const selected = String(selectedText || "").trim();
    if (!selected) return null;

    const reportText = [
      "Непереведённый текст:",
      selected,
      "",
      "Страница:",
      String(pageUrl || "https://github.com/")
    ].join("\n");
    const issueTitle = `Непереведённый текст: ${selected.slice(0, 60)}`;
    const issueBody = `${reportText}\n\nДополнительно:\n- Браузер: ${String(userAgent || "не указан")}`;
    const issueUrl = `${REPO_ISSUES_NEW_URL}?${new URLSearchParams({
      title: issueTitle,
      body: issueBody
    }).toString()}`;

    return { reportText, issueTitle, issueBody, issueUrl };
  }

  return { buildUntranslatedIssue };
});
