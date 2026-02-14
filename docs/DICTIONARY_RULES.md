# Dictionary Rules

## Базовые правила
- Один ключ - одна UI-строка на английском.
- Значение - финальный перевод на русском без лишних пробелов.
- Не добавлять в словарь пользовательские данные.

## Что нельзя тащить в словарь
- Email, username, owner/repo токены.
- Хэши, пути к файлам, технические команды.
- Временные/динамические значения с цифрами, если это лучше покрыть шаблоном.

## Где хранить переводы
- Общие и короткие UI-строки: `dict-sections/19-ui-common.json`.
- Основные страницы репо/issues/pr: `dict-sections/13-repo-issues-pr.json`.
- Actions/Workflows/Dependabot: `dict-sections/15-actions-workflows.json`.
- Непереводимые бренд/тех-термины: `dict-sections/16-brand-tech-terms.json`.
- Настройки и безопасность: `dict-sections/10-*`, `11-*`, `12-*`, `14-*`.
- Точечные фиксы и приоритетные override: `dict-sections/00-overrides.json`.

## Порядок добавления
1. Сначала `incoming-translations.json`.
2. Затем `npm run dict:cycle`.
3. Если нужно ручное распределение: переносить ключи в профильный `dict-sections/*.json`.

## Порог качества
- `npm run dict:check` всегда зеленый.
- `npm run dict:lint:quality` без новых подозрительных ключей в вашем текущем блоке работ.

## Полезные команды чистки
- `npm run dict:normalize:style` - автоматическая нормализация стиля терминов в переводах.
- `npm run dict:audit:ru` - отчёт по проблемным местам перевода в `translation-audit-report.json`.
Аудит автоматически учитывает whitelist из `dict-sections/16-brand-tech-terms.json`, чтобы брендовые/тех-термины не считались за шум.
Для приоритизации чистки ориентируйтесь на поля `sameAsSourceNeedsReview` и `latinHeavyNeedsReview`.
