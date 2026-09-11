# Klepa AI — инструкции для ИИ-агентов

## Границы рабочего пространства

- Этот чекаут — независимый репозиторий плагина Klepa AI (`https://github.com/kartrez/klepa-new.git`). Соседние чекауты сайта обычно находятся в `../gpt-backend`, `../gpt-frontend` и `../gpt-server`. Корень OpenSpec — соседний каталог `../gpt-openspec`.
- Определять корень OpenSpec командой `openspec context --json` по полю `root.path` или ближайшим родительским `openspec/config.yaml`. Не зашивать абсолютный путь пользователя.
- Изменение, затрагивающее плагин и сайт, оформляется одним изменением OpenSpec в корне OpenSpec. Артефакты пишутся по-русски, заголовки OpenSpec и `SHALL`/`MUST` остаются английскими.
- Перед изменениями выполнить `git fetch` и `git status -sb`. Сохранять посторонние незавершённые изменения. Git-команды выполнять из этого чекаута, не из OpenSpec и не из чекаутов сайта.
- Рабочая ветка проверяется по `git status -sb`; не считать `main` текущей без этой проверки.
- Правила этого монорепозитория живут здесь и в ближайшем `AGENTS.md` пакета. Не дублировать их в артефактах OpenSpec и не создавать полную копию в `.claude/rules/`.

## Стек

- Bun 1.3 и Turborepo; поле `packageManager` в корневом `package.json` — источник версии Bun
- TypeScript; проверка типов через `tsgo` (`bun turbo typecheck`), не через голый `tsc`
- CLI и агентный рантайм — `packages/opencode/` (форк OpenCode), HTTP + SSE
- Расширение VS Code/Qoder — `packages/kilo-vscode/`: Node/CJS-хост и Solid.js-webview, сборка esbuild
- Клиент API — автогенерируемый `@kilocode/sdk`
- Публикация расширения — `@vscode/vsce` и GitHub Actions `.github/workflows/publish-extension.yml`

## Структура каталогов

- `packages/opencode/` — `@kilocode/cli`: агенты, инструменты, сессии, сервер, TUI. Здесь большая часть рантайма
- `packages/sdk/js/` — `@kilocode/sdk`: клиент API сервера. Каталог `src/gen/` не править руками
- `packages/kilo-vscode/` — расширение Klepa AI для VS Code/Qoder (`copy-code.copy-coder`). Свои правила — в `packages/kilo-vscode/AGENTS.md`
- `packages/kilo-jetbrains/` — плагин JetBrains. Перед правками читать `packages/kilo-jetbrains/AGENTS.md`; Java 21 нужна только если Gradle падает из-за Java
- `packages/kilo-gateway/` — авторизация устройства, маршрутизация провайдеров, API Klepa
- `packages/kilo-ui/` — библиотека компонентов Solid.js для webview
- `packages/kilo-i18n/` — строки перевода
- `packages/kilo-telemetry/` — аналитика и трассировка
- `packages/kilo-docs/` — документация
- `packages/util/` — общие утилиты (`@opencode-ai/util`)
- `packages/plugin/` — интерфейсы плагинов и инструментов
- `.changeset/` — файлы заметок релиза
- `.github/workflows/` — CI; список файлов должен совпадать с `script/check-workflows.ts`

## Архитектура

- Все клиенты тонкие: они поднимают или подключаются к `kilo serve` и говорят с ним по HTTP REST + SSE через `@kilocode/sdk`
- Расширение VS Code кладёт свой CLI в `packages/kilo-vscode/bin/` (`kilo` / `kilo.exe`) и порождает `kilo serve --port 0`. Системный `kilo` с PATH не используется
- В одном хосте расширения один `KiloConnectionService` на сайдбар, вкладки и Agent Manager; отдельный `kilo serve` на каждый worktree не запускается
- Agent Manager — панель внутри расширения (`src/agent-manager/`, `webview-ui/agent-manager/`), не отдельный продукт
- Настройки расширения держать в настройках Klepa, а не в общих настройках VS Code, если они не задуманы как общередакторные

## Аутентификация на сайте gpt-chat.by

- Вход плагина идёт через страницу сайта `/vscode-auth` и обработчик `packages/kilo-vscode/src/kilo-provider/handlers/gpt-chat-by-auth.ts`
- База URL: `GPT_CHAT_BY_AUTH_URL` / `GPT_CHAT_BY_API_BASE`
- На странице одна кнопка «Войти»; она открывает диалог сайта `AppLogin`, а не провайдера напрямую
- После входа сайт публикует API-ключ в одноразовую сессию `POST /api/vscode-auth/session/{state}`; плагин забирает его опросом `GET` (deep-link остаётся быстрым путём)
- Поведение сессии — в корне OpenSpec, способность `vscode-auth-session`

## Команды

| Область | Команды |
|---|---|
| CLI, разработка | Из корня: `bun run dev`. Из `packages/opencode/`: `bun run --conditions=browser src/index.ts` |
| Проверка типов | Из корня: `bun turbo typecheck`. Из пакета — его `bun run typecheck` |
| Тесты CLI | Только из `packages/opencode/`: `bun test` или `bun test ./путь/к/файлу.test.ts` |
| Расширение VS Code | Из `packages/kilo-vscode/`: `bun run typecheck`, `bun run lint`, `bun test tests/unit/` |
| Сборка расширения | Из `packages/kilo-vscode/`: `bun script/local-bin.ts`, затем `node esbuild.js --production`; полный `bun run compile` / `bun run package` ещё гоняют typecheck и lint |
| Запуск в VS Code | Из корня: `bun run extension` (сборка + запуск). `--no-build` пропускает сборку |
| SDK после смены API | Из корня: `./script/generate.ts` — пересобирает `packages/sdk/js/` |
| Сторожа CI | `bun run knip` из `packages/kilo-vscode/`; `bun run check-kilocode-change` оттуда же; `bun run script/check-opencode-annotations.ts --worktree` из корня; `bun run script/check-workflows.ts` из корня |

Никогда не запускать `bun test` из корня: скрипт печатает `do not run tests from root` и выходит с кодом 1.

Перед тем как назвать реализацию готовой, прогнать минимальный набор lint / typecheck / тестов затронутого пакета. Не полагаться на ручной запуск расширения как на единственную проверку сборки.

## Форк OpenCode

Это форк [opencode](https://github.com/anomalyco/opencode). Общие файлы с апстримом менять в последнюю очередь. Всё вне каталогов с `kilo` в имени — общее, кроме путей, где `kilo` уже есть в сегменте (`packages/opencode/src/kilocode/`, `packages/kilo-*`).

- Новый код Klepa класть в `packages/opencode/src/kilocode/`, `packages/opencode/test/kilocode/` или отдельные пакеты `packages/kilo-*`
- Правки в общих файлах держать маленькими и помечать маркером `kilocode_change` (`// kilocode_change`, блоки `start`/`end`, в JSX `{/* kilocode_change */}`). В путях с `kilo` в имени маркеры не нужны
- В `packages/kilo-vscode/` и `packages/kilo-ui/` маркеры `kilocode_change` запрещены: это целиком код Klepa, CI это проверяет
- Не рефакторить апстримовый код без необходимости
- `bun install` выставляет локально `merge.conflictStyle=zdiff3`; не переопределять это в пользовательском gitconfig

## Качество кода

- Предпочитать `const`, ранний `return` вместо `else`, не использовать `any`
- Не оставлять пустой `catch`: либо убрать `try`, либо обработать ошибку, либо записать её в журнал
- Использовать API Bun, где это уместно (`Bun.file()`)
- Тесты проверяют реализацию, а не копию логики; моки — только когда без них нельзя
- Пользовательские изменения (фича, исправление, ломающее изменение) требуют changeset: `.changeset/<slug>.md` или `bunx changeset add`. В тексте — что изменилось для пользователя, повелительное наклонение. `patch` / `minor` / `major` — по смыслу
- В markdown-таблицах не выравнивать столбцы пробелами: `| A | B |` и разделитель `|---|---|`. Выравнивание раздувает diff; в CI это ловит `script/check-md-table-padding.ts`
- Правило в этом файле — самодостаточный однострочник: что делать и чем грозит откат. Обоснование живёт в изменении OpenSpec

## Сборка и публикация расширения

- Локальный `.vsix` для Windows: из `packages/kilo-vscode/` выполнить `bun script/local-bin.ts`, `node esbuild.js --production`, затем `vsce package --no-dependencies --skip-license --target win32-x64 -o out/`
- `bun run compile` и `bun run package` требуют зелёных typecheck и lint; если они падают на машине агента, production-бандл и `vsce package` всё равно можно собрать отдельно, как выше
- Продакшен маркетплейса — workflow `Publish Extension` по тегу `v*` или ручной `workflow_dispatch`. Не публиковать и не пушить тег без явной просьбы пользователя
- Повторная публикация той же версии после таймаута API: `vsce publish --skip-duplicate`, иначе уже залитые платформы упадут с «version already exists»
- Секрет `VSCODE_MARKETPLACE_TOKEN` живёт в GitHub Actions. Не класть PAT, пароли и токены в `AGENTS.md`, Git или ответы

## Безопасность

- Секреты только через переменные окружения или хранилище CI
- Никогда не коммитить секреты в Git
- Не деплоить, не публиковать в Marketplace и не пушить в защищённые ветки без явной просьбы пользователя в текущем разговоре
