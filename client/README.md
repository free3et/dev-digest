# `@devdigest/web` — the studio (Next.js 15)

The DevDigest UI: import repos, browse pull requests, run and read AI reviews,
and author agents. App Router + React Server/Client components, data via
**TanStack Query** hooks over the Fastify API. (This is the starter surface;
course lessons add the Skills, Memory, Eval, Blast/Brief, multi-agent, CI, and
dashboard screens.)

- **Stack:** Next.js 15 (App Router), React 19, TanStack Query, `next-intl`
  (messages in `messages/<locale>/*.json`), `recharts`, `mermaid`,
  `react-markdown`. UI primitives are vendored under `src/vendor/ui`
  (`@devdigest/ui`) and shared Zod contracts under `src/vendor/shared`
  (`@devdigest/shared`).
- **API base:** `NEXT_PUBLIC_API_BASE` (default `http://localhost:3001`), used by
  `src/lib/api.ts`. Every data hook lives in `src/lib/hooks/*`.
- **Run:** `pnpm dev` (`:3000`). **Test:** `pnpm test` (vitest + jsdom, fetch
  mocked — no API needed). **Typecheck:** `pnpm typecheck`.

## UI route map

Routes (`src/app/**/page.tsx`) and the API surface each leans on (via
`src/lib/hooks/*` → `src/lib/api.ts`):

```mermaid
flowchart TD
  ROOT["/"] -->|"useRepos → GET /repos"| PULLS["/repos/:repoId/pulls<br/>PR list"]
  ONB["/onboarding<br/>add repo"] -->|"POST /repos"| API[("Fastify API")]
  PULLS --> PR["/pulls/:number<br/>review detail<br/>(overview · diff · findings)"]

  CONTEXT["/repos/:repoId/context<br/>Project Context<br/>(list · preview · edit)"]
  AGENTS["/agents"] --> AGENT["/agents/:id<br/>editor (config · skills)"]
  SKILLS["/skills<br/>cards · preview · editor · import"]
  SETTINGS["/settings/:section<br/>API keys · models"]
  EVALS["/eval<br/>Eval Dashboard"]
  EVALPAGE["/eval/:agentId<br/>per-agent eval page<br/>(cards · trend · runs · compare)"]
  EVALS -->|"card chevron · recent-run link"| EVALPAGE
  EVALPAGE -->|"Open Evals tab"| AGENT

  PULLS -->|"GET /repos/:id/pulls · /repos/:id/index-state"| API
  PR -->|"GET /pulls/:id · /reviews · /pulls/:id/comments<br/>POST /pulls/:id/review · /findings/:id/(accept|dismiss)"| API
  CONTEXT -->|"GET /repos/:id/context · GET|PUT /repos/:id/context/file"| API
  AGENTS -->|"/agents · /agents/:id"| API
  AGENT -->|"Evals tab (?tab=evals)<br/>GET|POST /agents/:id/eval-cases · eval-runs"| API
  PR -->|"GET /findings/:id/eval-case/draft<br/>POST /findings/:id/eval-case/dry-run · POST /findings/:id/eval-case"| API
  EVALS -->|"GET /eval/dashboard · GET /eval/recent-runs?limit=50"| API
  EVALPAGE -->|"GET /agents/:id · GET|POST /agents/:id/eval-runs · GET /agents/:id/eval-cases<br/>GET /eval/dashboard (switcher)"| API
  SETTINGS -->|"/settings · /providers"| API
```

Cross-cutting chrome lives in `src/components/app-shell` (nav, breadcrumbs,
`g`-then-key shortcuts). Pages are thin; feature logic sits in colocated
`_components/<Name>/` folders, each with its own `*.test.tsx`.

Eval pipeline UI (the "Turn into eval case" control on `FindingCard` and the
`EvalCaseModal` it opens (draft, edit, dry-run, save), the agent Evals tab with
its regression banner and compare dialog, the `/eval` dashboard with recent
runs and recall sparklines, and the per-agent eval page `/eval/:agentId` with
metric cards and a trend chart): [`docs/eval-ui.md`](docs/eval-ui.md).

## Testing

Component/interaction tests (`*.test.tsx`) run under vitest + jsdom with `fetch`
mocked, so they need neither the API nor a browser. The real browser journeys
(client + API + seeded DB) are covered by the deterministic agent-browser suite
in [`../e2e`](../e2e/README.md) and the `e2e-web.yml` workflow. See
[`../TESTING.md`](../TESTING.md).
