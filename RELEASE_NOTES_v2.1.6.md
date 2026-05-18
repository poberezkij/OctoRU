# OctoRU v2.1.6

## Что нового

- Добавлен e2e smoke-тест распакованного Chrome-расширения.
- Тест проверяет ключевой сценарий OctoRU: элементы UI переводятся, а README, комментарии и блоки кода остаются без перевода.
- Проверки релиза теперь не изменяют `dict-version.json` и `dict-changelog.md`, если словарь не менялся.

## Надёжность релиза

- В release-архив добавлен `dict-version.json`, который используется background service worker при обновлении bundled-словаря.
- CI и release workflow переведены на `npm ci` для воспроизводимой установки зависимостей.
- Release workflow использует общий проектный скрипт `npm run release:zip`.
- Добавлены проверки manifest/runtime assets и синхронизации версий `package.json`, `manifest.json`, `package-lock.json`.

## Технически

- Версия расширения: `2.1.6`
- Версия npm-пакета: `2.1.6`
- Релизный артефакт: `dist/OctoRU-v2.1.6.zip`
