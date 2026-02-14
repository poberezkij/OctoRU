(function () {
  "use strict";

  function ruPlural(n, one, few, many) {
    const nn = Math.abs(n) % 100;
    const n1 = nn % 10;
    if (nn > 10 && nn < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  }

  function parseCount(raw) {
    const t = String(raw).trim();
    const cleaned = t.replace(/,/g, "");
    const m = cleaned.match(/^(\d+(?:\.\d+)?)([kKmM])?$/);
    if (!m) return { raw: t, n: NaN };
    let num = parseFloat(m[1]);
    const suffix = m[2] ? m[2].toLowerCase() : "";
    if (suffix === "k") num *= 1000;
    if (suffix === "m") num *= 1000000;
    return { raw: t, n: Number.isFinite(num) ? Math.round(num) : NaN };
  }

  function monthToRuGenitive(monthRaw) {
    const m = String(monthRaw || "").toLowerCase();
    const map = {
      jan: "января",
      january: "января",
      feb: "февраля",
      february: "февраля",
      mar: "марта",
      march: "марта",
      apr: "апреля",
      april: "апреля",
      may: "мая",
      jun: "июня",
      june: "июня",
      jul: "июля",
      july: "июля",
      aug: "августа",
      august: "августа",
      sep: "сентября",
      sept: "сентября",
      september: "сентября",
      oct: "октября",
      october: "октября",
      nov: "ноября",
      november: "ноября",
      dec: "декабря",
      december: "декабря"
    };
    return map[m] || null;
  }

  function translateMonthToken(monthRaw, translations, translationsCI) {
    return (
      translations.get(monthRaw) ||
      translationsCI.get(monthRaw.toLowerCase()) ||
      monthRaw
    );
  }

  function ghruApplyDynamicRules(key, ctx) {
    const norm = ctx && typeof ctx.norm === "function" ? ctx.norm : String;
    const translations = ctx && ctx.translations ? ctx.translations : new Map();
    const translationsCI = ctx && ctx.translationsCI ? ctx.translationsCI : new Map();

    const t = norm(key);
    if (!t) return null;

    let m;

    m = t.match(/^([A-Za-z0-9_.-]{2,})\s+had no activity during this period\.?$/i);
    if (m) return m[1] + ": активности за этот период нет";

    m = t.match(/^([A-Za-z0-9_.-]{2,})\s+has no activity yet for this period\.?$/i);
    if (m) return m[1] + ": пока нет активности за этот период";


    m = t.match(/^([A-Za-z0-9_.-]{2,})\s+doesn't have any public repositories yet\.?$/i);
    if (m) return m[1] + ": пока нет публичных репозиториев";
    m = t.match(/^([A-Za-z0-9_.-]{2,})\s*[\u00B7\u2022]$/);
    if (m) return m[1] + " ·";

    m = t.match(/^No contributions on\s+([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?$/i);
    if (m) {
      const monthRu = monthToRuGenitive(m[1]);
      if (monthRu) return "Нет вкладов " + m[2] + " " + monthRu;
    }

    m = t.match(/^Link to social profile\s+(\d+)$/i);
    if (m) return "Ссылка на соцпрофиль " + m[1];

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+contributions in the last year$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "вклад", "вклада", "вкладов")
        : "вкладов";
      return m[1] + " " + word + " за последний год";
    }

    m = t.match(/^\u00a9\s*(\d{4})\s+GitHub,\s+Inc$/i);
    if (m) return "\u00a9 " + m[1] + " GitHub, Inc";

    m = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
    if (m) {
      const monthRu = translateMonthToken(m[1], translations, translationsCI);
      return monthRu + " " + m[2];
    }

    m = t.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s*([-\u2013\u2014])\s*([A-Za-z]{3,9})?\s*(\d{1,2}),\s*(\d{4})$/);
    if (m) {
      const m1Ru = translateMonthToken(m[1], translations, translationsCI);
      const m2Raw = m[4] || m[1];
      const m2Ru = translateMonthToken(m2Raw, translations, translationsCI);
      return m1Ru + " " + m[2] + " " + m[3] + " " + m2Ru + " " + m[5] + ", " + m[6];
    }

    m = t.match(/^Contribution activity in\s+(\d{4})$/i);
    if (m) return "Активность за " + m[1] + " год";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+stargazers?$/i);
    if (m) return m[1] + " звёзд";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+suggestions?$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "предложение", "предложения", "предложений")
        : "предложений";
      return m[1] + " " + word;
    }

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+characters remaining$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "символ", "символа", "символов")
        : "символов";
      return "Осталось " + m[1] + " " + word;
    }

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+followers?$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "подписчик", "подписчика", "подписчиков")
        : "подписчиков";
      return m[1] + " " + word;
    }

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+following$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "подписка", "подписки", "подписок")
        : "подписок";
      return m[1] + " " + word;
    }

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+results$/i);
    if (m) return m[1] + " результатов";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+repositories$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "репозиторий", "репозитория", "репозиториев")
        : "репозиториев";
      return m[1] + " " + word;
    }

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+remaining$/i);
    if (m) return m[1] + " осталось";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+updated$/i);
    if (m) return m[1] + " обновлено";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+Open$/i);
    if (m) return m[1] + " открыто";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+Closed$/i);
    if (m) return m[1] + " закрыто";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+account connected$/i);
    if (m) return m[1] + " аккаунт подключён";

    m = t.match(/^(\d[\d.,]*[kKmM]?)\s+verified email configured$/i);
    if (m) return m[1] + " подтверждённый email настроен";

    m = t.match(/^Selected\s+(\d[\d.,]*[kKmM]?)\s+repositories$/i);
    if (m) {
      const parsed = parseCount(m[1]);
      const word = Number.isFinite(parsed.n)
        ? ruPlural(parsed.n, "репозиторий", "репозитория", "репозиториев")
        : "репозиториев";
      return "Выбрано " + m[1] + " " + word;
    }

    m = t.match(/^at least\s+(\d+)\s+characters$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return "минимум " + m[1] + " " + ruPlural(n, "символ", "символа", "символов");
    }

    m = t.match(/^(\d+)\s+days?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return m[1] + " " + ruPlural(n, "день", "дня", "дней");
    }

    m = t.match(/^(\d+)\s+hours?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return m[1] + " " + ruPlural(n, "час", "часа", "часов");
    }

    m = t.match(/^(\d+)\s+weeks?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return m[1] + " " + ruPlural(n, "неделя", "недели", "недель");
    }

    m = t.match(/^(\d+)\s+months?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return m[1] + " " + ruPlural(n, "месяц", "месяца", "месяцев");
    }

    m = t.match(/^In\s+(\d+)\s+minutes?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return "Через " + m[1] + " " + ruPlural(n, "минуту", "минуты", "минут");
    }

    m = t.match(/^In\s+(\d+)\s+hours?$/i);
    if (m) {
      const n = parseInt(m[1], 10);
      return "Через " + m[1] + " " + ruPlural(n, "час", "часа", "часов");
    }

    return null;
  }

  window.ghruApplyDynamicRules = ghruApplyDynamicRules;
})();
