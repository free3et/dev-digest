# План покращень DevDigest

Дата: 2026-09-19 · гілка `hw2-skills` · лише аналіз, код не змінювався.
Застосовані скіли: `onion-architecture`, `frontend-ui-architecture`,
`react-best-practices`, `next-best-practices`, `fastify-best-practices`,
`drizzle-orm-patterns`, `postgresql-table-design`, `zod`, `typescript-expert`,
`security`, `react-testing-library`.

## 0. Стан тестів (перед змінами)

| Пакет | typecheck | тести |
| --- | --- | --- |
| client | ✅ | 62/62 |
| reviewer-core | ✅ | 23/23 |
| server | ✅ | 128 ✅ / **7 ❌** (давні, не від цього аналізу) |

Причини 7 падінь:
1. **Схема ↔ міграції (6 тестів).** `0009_complex_runaways.sql` видаляє
   `agent_runs.cost_usd`, а `src/db/schema/runs.ts:22` знову оголошує `costUsd`
   без нової міграції. На свіжій БД запис запуску дає
   `column "cost_usd" does not exist`.
2. **Фікстура (1 тест).** `test/contracts.test.ts` — `RunTrace` без `stats.cost_usd`.

Це реальний дефект застосунку, а не лише тестів: на свіжій БД не працює запуск рев'ю.

## Фаза 1 — Виправити зламане (спершу)

| # | Що | Де | Як |
| - | -- | -- | -- |
| 1.1 | Дрейф `cost_usd` | `server/src/db/schema/runs.ts:22`, міграції | `pnpm db:generate` → нова міграція `0010` (потрібен явний дозвіл: CLAUDE.md забороняє вигадувати міграції) |
| 1.2 | Фікстура `RunTrace` | `server/test/contracts.test.ts` | додати `stats.cost_usd` |
| 1.3 | Path traversal у URL репо | `server/src/modules/repos/constants.ts:18`, `adapters/git/simple-git.ts:34,63` | regex не заякорений, owner приймає `..` → `clones/../x`, далі `rm -rf`. Заякорити `^https://github.com/`, сегменти `[A-Za-z0-9_.-]+`, відхиляти `.`/`..`, перевіряти що шлях у `cloneDir`; клонувати канонічний URL. Звузити `RepoInput` у `@devdigest/shared` |
| 1.4 | Токен у remote clone | `server/src/modules/repos/helpers.ts:35-40` | після clone `git remote set-url origin <без токена>` або `http.extraHeader` |
| 1.5 | API слухає `0.0.0.0` без авторизації | `server/src/server.ts:29` | за замовчуванням `127.0.0.1`, `HOST` через env для Docker |
| 1.6 | `POST /settings/test-connection` пише секрет і віддає сирий текст помилки | `server/src/modules/settings/routes.ts:79-96` | не зберігати як побічний ефект; загальне повідомлення |
| 1.7 | Обробник помилок віддає `e.message` (в т.ч. Postgres) | `server/src/app.ts:161-163` | для ≥500 — `Internal error`, деталі в лог |

## Фаза 2 — Backend: Onion Architecture

Перевірено на цій гілці; частина записів `INSIGHTS.md` застаріла (див. фазу 5).

| # | Порушення | Evidence | Виправлення |
| - | --------- | -------- | ----------- |
| 2.1 | Transport ходить у БД | `settings`, `polling`, `workspace` `routes.ts` імпортують `drizzle-orm`+`db/schema` | `settings/{service,repository}.ts`; sync з `polling` у `PullsService`; `workspace` через `container.reposRepo` (додати getter) |
| 2.2 | Ring-1 helper імпортує схему | `repos/helpers.ts:2` | типи з `src/db/rows.ts` |
| 2.3 | Запит у `feature-models.ts` поза repository | `settings/feature-models.ts:1,8,41` | у `SettingsRepository` |
| 2.4 | Сервіси створюються в routes | `reviews/routes.ts:22`, `repos/routes.ts:21`, `pulls/routes.ts:23`, `agents/routes.ts:72`, `repo-intel/routes.ts:29`; `app.ts` створює другий `ReviewService` | getters у `container.ts` |
| 2.5 | Логіка в routes | ручний `RunRequest.parse` (`reviews/routes.ts:32`), SSE-міст (`:47-83`), test-connection | `schema.body`; міст у `platform/sse.ts`; сервіс |
| 2.6 | Type-import схеми в `run-executor.ts:5`, `diff-loader.ts:4` | | `db/rows.ts` |
| 2.7 | **Нуль транзакцій** | `run-executor.ts:218-234`, `pulls/repository.ts:118-132`, `agents/repository.ts:225-238`, settings-цикл | сервіс відкриває `db.transaction`, репозиторії приймають `tx?`. Найризикованіше — delete+insert `pr_files` (втрата збереженого diff) |
| 2.8 | Немає `schema.response` | жоден роут | оголосити для кожного роуту контракт із `@devdigest/shared` |
| 2.9 | IDOR-готовність | `cancelRun`/`getRunTrace` без `workspaceId` | передавати `workspaceId` як у `deleteRun` |
| 2.10 | Тести шарів | немає `service.test.ts` | сервісні тести з `mocks.ts`; `pulls/helpers.test.ts` лежить у `src/`, решта в `test/` — обрати одне місце |

## Фаза 3 — База даних

| # | Що | Виправлення |
| - | -- | ----------- |
| 3.1 | Жодного індексу на гарячих таблицях (`findings.review_id`, `reviews.pr_id`, `reviews.run_id`, `agent_runs.pr_id`+`ran_at`, `agent_versions.agent_id`) | `index()` у схемі → `db:generate` |
| 3.2 | Немає CHECK на статуси/enum; `agent_runs.status` nullable без default, хоча reaper шукає `'running'` | `.notNull().default('running')` + `check()` |
| 3.3 | `reviews.agentId`/`runId` без FK | `.references(..., { onDelete: 'set null' })` |
| 3.4 | `ranAt` з `defaultNow()` замість спільного `now()` | уніфікувати |
| 3.5 | Читання `jsonb` без повторного parse | `safeParse` на читанні; для `AgentVersionConfig.parse` — 500, не 422 |
| 3.6 | `exactOptionalPropertyTypes` вимкнено, скрізь умовні spread | розглянути, після фаз 1–2 |

Усі пункти 3.x — через `db:generate`, не вручну.

## Фаза 4 — Frontend

**Архітектура (`frontend-ui-architecture`)**
- 4.1 `pulls/[number]/page.tsx` (185 рядків) тримає `useQueryClient` і рядкові ключі `["pr-active-runs", …]`, що дублюють `lib/hooks/reviews.ts`. → `lib/hooks/keys.ts` (`qk.*`) + `usePrDetailPage` у `[number]/hooks/`; чисту деривацію (`allFindings`, `lethalTrifecta`) у `helpers.ts` з тестом.
- 4.2 `ApiError` імпортується в UI у 5 файлах → `getErrorMessage(err)` у `lib/`.
- 4.3 `FindingsTab` отримує mutation-об'єкт пропом → `onCancel` + `isCancelling`.
- 4.4 Дублікати: `SEVERITY_ORDER` vs `SEV_RANK` та літерали серйозності у 6 файлах → один тип із `@devdigest/shared`, константа на рівні фічі; `formatWhen` ×2 → `lib/format.ts`.
- 4.5 `RunHistory/` (331 рядок) без `index.ts`/`styles.ts`/`helpers.ts`, `RunFindingsHoverCard.tsx` — голий сусід; `RunTraceDrawer/_components/atoms.tsx` — багатокомпонентний файл. Розбити за конвенцією.
- 4.6 Імпорти: ~25 місць із 5–7 рівнями `../`, тести мокають глибокі шляхи → `@/` скрізь; одна дорога імпорту хуків (без wildcard-barrel `lib/hooks/index.ts`); `RunTraceDrawer/index.ts` — лише named.
- 4.7 Типи: `SEVERITY_ORDER: Record<string, number>` + `in` (ловить `constructor`) → `Record<Severity, number>` і `Object.hasOwn`; `tab` як union.

**Next.js (`next-best-practices`)**
- 4.8 **Немає `error.tsx`/`loading.tsx`/`not-found.tsx`/`global-error.tsx`** (підтверджено `find`). Помилка рендеру = білий екран.
- 4.9 6 із 8 `page.tsx` — `"use client"` на корені; заголовок завжди «DevDigest». → серверні `page.tsx` + `generateMetadata`, `"use client"` вниз у `*View`.
- 4.10 `app/page.tsx` редіректить через `useEffect` → серверний `redirect()`.

**i18n**
- 4.11 Багато захардкоджених англійських рядків (PR-сторінка, welcome, вкладки `PrDetailHeader`, `AgentCard`, `AddRepoView` тощо) при наявних `messages/en/*.json`. Спочатку grep по наявних ключах.
- 4.12 Чотири `window.confirm` → один `useConfirm()`.
- 4.13 Ключі не в camelCase (`needs_review`, `single-pass`, `onboarding-tour`…) і пласкі namespace (`onboarding`, `agentPerformance`, `context`, `brief`) → мапа enum→camelCase-ключ, вкласти в секції.

**React / безпека**
- 4.14 `MermaidDiagram.tsx:47` `innerHTML = svg` з даних репо → DOMPurify або `<img data:>`; `initialize()` раз, тема з `useTheme()` (зараз завжди `dark`).

**Тести**
- 4.15 `lib/` майже без тестів (`api.ts`, `model-label`, `github-urls`, hooks). Інтеракційні тести мокають модулі хуків замість `fetch` — не перевіряють контракт.

## Фаза 5 — Контракти, reviewer-core, CI, документація

| # | Що | Дія |
| - | -- | --- |
| 5.1 | Клієнтська копія `@devdigest/shared` розійшлась (5 файлів) і жоден gate не ловить; `client.yml` без `paths` на `server/src/vendor/shared/**` | `scripts/sync-shared.sh` із `--check`, крок у CI, path filter; далі — alias на єдину копію |
| 5.2 | `reviewer-core` містить мережевий адаптер (`llm/openrouter.ts:1,51`, `structured.ts:2` імпортують `openai`) — суперечить README | винести `OpenRouterProvider` у `server/src/adapters/llm/`, залишити `toJsonSchema`/`extractJson`/`parseWithRepair` |
| 5.3 | Два Zod (alias на `reviewer-core/node_modules/zod`) | однакова версія + CI-перевірка |
| 5.4 | Тести ядра: немає прямих для `grounding.ts`, `structured.ts`, `reduce.ts` | додати |
| 5.5 | CI: немає lint/arch; e2e без typecheck, без `timeout-minutes`, `agent-browser` не запінений, цикли очікування без `kill -0`; path filters без `reviewer-core/**` (integration, e2e) | виправити |
| 5.6 | Відсутні `.dependency-cruiser.cjs`, `eslint.config.mjs`, скрипт `arch`, хоча `dependency-cruiser` у dependencies | відновити конфіги (мінімум `routes → db` заборона + `reviewer-core` без `fs`/`process.env`) |
| 5.7 | Немає перевірки `db:generate` → «no diff», немає audit/Dependabot | додати |
| 5.8 | Секрети: запис `secrets.json` не атомарний, `chmod` лише при створенні, каталог без `0700`; Postgres на `0.0.0.0:5432` | `mkdir 0700`, `chmod`, tmp+`rename`; `127.0.0.1:5432` |
| 5.9 | Rate-limit вимикається за `NODE_ENV=test` | явний прапор |
| 5.10 | Невикористана залежність `@fastify/autoload` | видалити |
| 5.11 | TESTING.md: «typecheck теж на Windows» суперечить `server-unit.yml` | виправити |
| 5.12 | Зміст `INSIGHTS.md` розходиться з чекаутом | див. нижче |

**Застарілі записи `server/INSIGHTS.md`** (описують стан, повернений `c6af1e4`):
індекси «resolved» (`0012_…`), CHECK «partly resolved» (`0013_…`), `agent_skills.enabled` (`0014_…`), `0016_…`, `fflate`/`skills/service.ts` (модуля `skills` немає), і всі згадки `.dependency-cruiser.cjs` / `eslint.config.mjs` / `pnpm arch`. Додати датовані виправлення за правилами `engineering-insights`.

## Що агенти стверджували, але не підтвердилось

- «`server/package.json` у skip-worktree» — `git ls-files -v` показує `H` (звичайний). Не пункт плану.
- «Симлінки `CLAUDE.md` → кореневий `AGENTS.md`» — це відносні симлінки на `AGENTS.md` у тій самій теці, тож змістом кожного модуля вони не втрачаються. Не пункт плану.

## Порядок виконання

1. Фаза 1 (1.1 після дозволу на міграцію) → прогнати `server`/`client`/`reviewer-core` тести.
2. 2.7 транзакції + 3.1–3.4 в одній міграції; 2.1–2.6.
3. 5.1, 5.6 — щоб не повернулось.
4. Фаза 4 (4.8–4.9 першими).
5. Решта, `INSIGHTS.md` — після кожної групи.
