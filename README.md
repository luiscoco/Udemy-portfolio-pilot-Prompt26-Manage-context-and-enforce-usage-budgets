# PortfolioPilot: Milestone 26 — Context and Usage Budgets

PortfolioPilot is a teaching project for a stock portfolio manager with news and portfolio-aware AI chat. This learning activity adds limits and conversation context management to the existing application. The application uses the **Claude Agent SDK** (the library that runs the assistant), even when another coding agent implements the lesson.

## 1. Purpose and learning goals

The milestone prompt asks the coding agent to limit model selection, prompt size, tool-result size, turns, elapsed time, and estimated cost. It also asks for a daily budget shared by every run belonging to one user, plus conversation summaries that preserve sources and portfolio scope.

These controls matter because a slow tool, repeated model calls, or simultaneous requests can otherwise consume more resources than intended. Long conversations also need a deliberate context reset: old analysis must not become evidence of current market conditions.

Students will learn how to:

- Combine supported SDK options with checks in application code.
- Separate observed token usage, estimated cost, and actual billed cost.
- Use a database transaction (a group of changes committed together) to reserve a budget safely under concurrent requests.
- Finish streams predictably after rejection, timeout, cancellation, or a limit violation.
- Summarize an owned conversation while retaining requested scope, source references, and freshness labels.

The project remains a research application: the assistant never executes trades. Mock mode uses deterministic fixtures and needs no AI or market-data credentials.

## 2. Steps performed

The implementation followed these steps. Detailed file lists and rationale are in the [milestone lesson](docs/lessons/26-context-and-usage-budgets.md) and [architecture decision 0019](docs/decisions/0019-agent-limits-and-daily-reservations.md).

1. **Inspect the project and SDK contract.** Read the project rules, state, plan, existing run lifecycle, installed SDK types, and official SDK documentation. Kept the pinned SDK version; no dependencies were upgraded. Identified the supported `maxTurns`, `maxBudgetUsd`, cancellation, model, and result-usage fields.
2. **Add server configuration and stable data contracts.** Updated `packages/config/src/server.ts`, `packages/contracts/src/chat.ts`, `packages/contracts/src/agent-events.ts`, and `apps/api/.env.example`. Model identifiers stay on the server. The browser receives application events rather than raw SDK messages.
3. **Enforce run limits and measure usage.** Updated `packages/agent/src/streaming.ts`, delegation, mock execution, and tool handling. Retries share the remaining turns, cost, and deadline. Timeout handling races pending operations against cancellation and closes the SDK query. Added `packages/agent/test/limits.test.ts` and updated existing fixture assertions.
4. **Create atomic daily reservations.** Added `packages/db/src/agent-budget.ts`, the `agent_budgets` migration, and `apps/api/lib/agent-budget-money.ts`. Run admission reserves budget in the same PostgreSQL transaction as run and user-message creation. Completion reconciles that reservation exactly once. Money uses exact microdollars (one millionth of a dollar), rather than floating-point arithmetic.
5. **Manage conversation context explicitly.** Updated `packages/agent/src/research-context.ts` and database chat/portfolio services. Resets start a new SDK session from an application summary of owned saved history. Oversized context and incomplete full-portfolio lookups produce visible failures.
6. **Show understandable terminal states.** Updated `apps/api/lib/chat.ts`, `chat-coordinator.ts`, HTTP error handling, and `apps/web/src/chat.tsx`. The UI explains limits, timeout, cancellation, context reset, and daily rejection, then allows the user to continue.
7. **Verify and record results.** Added API/database tests and `apps/web/e2e/budgets.spec.ts`; ran compilation, unit tests, PostgreSQL acceptance tests, and a Chrome browser test. Updated `docs/project-state.md`, `docs/versions.md`, lesson 26, and the decisions index.

The implementation used these commands, with local environment variables and Windows workarounds described below:

```powershell
npm ci --ignore-scripts --offline --cache .npm-cache
npm run build:types
npm run migrate:deploy --workspace @portfolio-pilot/db
npm run seed:demo --workspace @portfolio-pilot/db
npm run typecheck
npm run lint
npm run build
npm run check:browser-boundary
npm run test
npm run test --workspace @portfolio-pilot/agent
npm run test --workspace @portfolio-pilot/api -- lib/budgets.integration.test.ts lib/chat-coordinator.test.ts lib/agent-budget-money.test.ts
npm run test:browser --workspace @portfolio-pilot/web -- budgets.spec.ts --workers=1
```

## 3. Results achieved

### Configurable limits

These settings are validated on the server. Their defaults are in [the API environment example](apps/api/.env.example).

| Setting | Default | What it controls |
| --- | --- | --- |
| `AGENT_MODEL_ID` | Required in Claude mode | Operator-selected model; actual runtime-reported model is recorded separately |
| `AGENT_MAX_PROMPT_BYTES` | `48000` | UTF-8 bytes in current request/context and live system instruction |
| `AGENT_MAX_TOOL_RESULT_BYTES` | `24000` | Complete serialized tool-result envelope |
| `AGENT_MAX_TURNS` | `6` | Main model round trips across attempts |
| `AGENT_WALL_CLOCK_MS` | `90000` | Total elapsed time, including approval waiting |
| `AGENT_MAX_COST_USD` | `0.10` | SDK estimated cost cap for the run |
| `AGENT_COST_OVERFLOW_USD` | `0.10` | Extra reservation for a response that crosses the cost cap |
| `AGENT_DAILY_BUDGET_USD` | `2.00` | User's charged plus reserved allowance per UTC day |
| `AGENT_CONTEXT_RESET_TURNS` | `8` | Interval for summary-seeded session resets |

The prompt byte check does not measure SDK-internal resumed transcripts or tool schemas. Those remain subject to supported SDK context behavior. A turn is a model round trip, not necessarily one visible chat message.

### Budget and usage behavior

By default, admission reserves **$0.20**: the $0.10 estimated run cap plus $0.10 overflow allowance. A conditional PostgreSQL update prevents simultaneous requests from exceeding the available daily reservation budget. A rejected request returns HTTP `429` with application code `BUDGET_EXHAUSTED`; it creates no run or user message and leaves no active answer stream.

Final SDK `modelUsage` provides aggregate tokens, including subagents. Partial messages and subagent totals are not added again. Duplicate callback/final reports replace one another for the same attempt. The SDK's `total_cost_usd` is recorded as an **estimate**, not an invoice. Mock runs record zero model charges. The model reported by the main runtime message is saved, with the initialization model as fallback.

After a crash or incomplete usage report, the application conservatively retains at least the full reservation, or a higher known estimate. An outstanding reservation still reduces the daily allowance. Stale-run reconciliation converts it into uncertain charged usage and displays an interrupted outcome; it does not automatically refund or launch another paid attempt. Accounting stays on the run's original UTC reservation day.

### Context and UI behavior

The application summary preserves exact historical user requests, the current portfolio scope, and validated source IDs, URLs, publication timestamps, and synthetic labels. It includes bounded excerpts of recent analysis and identifies omissions. Old analysis is labeled historical; current holdings, quotes, and news must be read again. A summary that cannot fit, or a full-scope lookup that is truncated, fails explicitly instead of silently answering for fewer portfolios. Saved chat remains in PostgreSQL.

The Chrome test observed the usage label `Mock run: no model charges.`, a visible reset notice, unchanged selected portfolio scope, a timeout outcome, explicit cancellation, and a daily-budget alert with Send enabled. Closing the browser is not cancellation; use **Cancel answer**.

### Observed verification results

These are recorded milestone results from **2026-10-03**, not a new test run performed while writing this README.

| Check | Observed result |
| --- | --- |
| Offline dependency installation | 348 packages; zero reported vulnerabilities |
| Fresh database migrations | All 15 applied to `portfolio_m26_verify` |
| Typecheck, lint, build, browser dependency boundary | Passed |
| Workspace credential-free suite | 282 passed, 99 opt-in skipped at that run |
| Final agent suite | 133 passed, 2 live tests skipped |
| Final focused limits/delegation/approval regression | 27/27 passed |
| Final API budgets/coordinator/money tests | 17/17 passed |
| Chrome budget/context acceptance | 1/1 passed |

Additional money/database cases were added after the workspace-wide run and passed in the focused suite; the 282 count is not a final recount of every test. Final compilation also passed after the last lock-order and UI wording changes; the browser test was not repeated after the final wording change.

For example, the database concurrency test observed:

```text
Daily allowance: $0.60
Reservation per run: $0.20
12 simultaneous requests: 3 accepted, 9 rejected
User messages created: 3
After three completions at $0.05 each:
  reserved = $0.00
  charged  = $0.15
```

## 4. How to run and verify

### Prerequisites

- Node.js **24.21.0** and npm **11.19.0**, matching the pinned project environment.
- Docker with a running engine and Docker Compose access, for local PostgreSQL and Redis.
- Google Chrome for the configured Playwright browser test.
- PowerShell for the commands below. Run them from the repository root.
- No Anthropic credentials for mock mode. See [verified versions](docs/versions.md) for compatibility details.

### Start the local mock application

This is the standard local setup using the root [Compose configuration](compose.yaml). It uses PostgreSQL on port **5432** and Redis on **6379**. The milestone acceptance run used the separate database described in the next section; this standard setup is not a claim of a new fresh-machine verification.

```powershell
node --version
npm --version
npm ci --ignore-scripts
npm run infra:start

$env:DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5432/portfolio_pilot'
$env:REDIS_URL='redis://127.0.0.1:6379'
$env:NODE_ENV='development'
$env:ALLOW_DEMO_SEED='true'
npm run build:types
npm run migrate:deploy --workspace @portfolio-pilot/db
npm run seed:demo --workspace @portfolio-pilot/db

$env:DATA_MODE='mock'
$env:AGENT_MODE='mock'
$env:DEMO_AUTH_ENABLED='true'
$env:AUTH_BASE_URL='http://127.0.0.1:5173'
$env:AUTH_SECRET='local-budget-verification-secret-1234567890'
$env:AGENT_MOCK_STREAM_DELAY_MS='0'
$env:AGENT_CONTEXT_RESET_TURNS='1'
$env:AGENT_WALL_CLOCK_MS='3000'
npm run dev
```

Example credentials and the authentication secret above are for local teaching only. `build:types` builds shared packages and generates the Prisma database client. `migrate:deploy` applies committed database schema changes. `seed:demo` adds repeatable demo users, portfolios, and synthetic market fixtures. With an existing populated database, inspect its contents before seeding; use the dedicated database for acceptance tests.

Open **http://127.0.0.1:5173/assistant**. Sign in as **Alice Demo**, select **Growth**, and create a conversation. Ask `What do I own?` twice. With the demonstration settings, expect a context-reset notice on the follow-up and the same portfolio scope. Send `Add ACME on XNYS to my watchlist` and leave approval pending to demonstrate the three-second timeout, provided that security is not already watchlisted. Repeat and click **Cancel answer** promptly. The automated test creates an unused security so that this case is deterministic.

For a prompt-size demonstration, stop the server with Ctrl+C, set the following variable, restart, and submit a 1,000-character request. Expect a visible prompt limit failure. Remove the override afterwards to restore the default.

```powershell
$env:AGENT_MAX_PROMPT_BYTES='256'
npm run dev
# After stopping the demonstration:
Remove-Item Env:AGENT_MAX_PROMPT_BYTES
```

### Run deterministic acceptance checks

Use a dedicated loopback PostgreSQL database named **`portfolio_m26_verify`**. Tests enforce this name and modify test data. Do not point them at your normal portfolio database or run them alongside unrelated demo activity.

The observed environment already had the container `portfolio-pilot-m06-verify` exposing PostgreSQL on **5546**. `npm run infra:start` does **not** create that container. If it is unavailable, provide a disposable local PostgreSQL instance with the same database/user/password and substitute its port in both URLs. That alternative provisioning path was not verified during this milestone.

On the observed container, the following database creation command was run once. Skip it if the database already exists:

```powershell
docker exec portfolio-pilot-m06-verify psql -U portfolio_local -d postgres -c 'CREATE DATABASE portfolio_m26_verify;'
```

In the server terminal, replace `DATABASE_URL` before migration, seeding, and startup, retaining the mock/authentication/reset/timeout settings above:

```powershell
$env:DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5546/portfolio_m26_verify'
npm run migrate:deploy --workspace @portfolio-pilot/db
npm run seed:demo --workspace @portfolio-pilot/db
npm run dev
```

In a second PowerShell window, run the focused checks sequentially. The browser test requires the API/Vite server above and Redis to remain running; it uses the same dedicated database and temporarily injects/restores an exhausted daily ledger.

```powershell
$env:DATA_MODE='mock'
$env:BUDGET_TEST_DATABASE_URL='postgresql://portfolio_local:local_only_change_me@127.0.0.1:5546/portfolio_m26_verify'
npm run test --workspace @portfolio-pilot/api -- lib/budgets.integration.test.ts lib/chat-coordinator.test.ts lib/agent-budget-money.test.ts
npm run test --workspace @portfolio-pilot/agent
$env:BUDGET_E2E_DATABASE_URL=$env:BUDGET_TEST_DATABASE_URL
npm run test:browser --workspace @portfolio-pilot/web -- budgets.spec.ts --workers=1

npm run typecheck
npm run lint
npm run build
npm run check:browser-boundary
```

The database tests check reservation races, ownership, rollback, exactly-once reconciliation, uncertain usage, timeout, shared retry limits, and preserved sources/scope. The browser test checks what a student actually sees. Without the budget database variables, database/browser acceptance tests are skipped; skipped tests do not verify those behaviors.

### Windows issues encountered and resolved

The NVM npm launcher was blocked in the observed environment. Checks used the installed Node directory first on PATH and invoked npm directly. If your launcher works, use ordinary `npm` commands. Otherwise, this was the local workaround; adjust the path for your installation:

```powershell
$env:PATH='C:\Users\luisc\AppData\Local\Author Software\nvm\installs\v24.21.0;'+$env:PATH
node 'C:\Users\luisc\AppData\Local\Author Software\nvm\installs\v24.21.0\node_modules\npm\bin\npm-cli.js' run build:types
```

Prisma generation initially failed with a Windows cache permission error, and migration execution could not run the extensionless cached engine. Copying the existing engine to a workspace `.exe` and setting `PRISMA_SCHEMA_ENGINE_BINARY` resolved these checks. The exact cache-dependent commands are in [lesson 26](docs/lessons/26-context-and-usage-budgets.md). The offline install command also requires the pre-existing `.npm-cache`; a fresh machine normally uses the online install command above.

## 5. Limitations and unfinished work

- **Live Claude behavior is unverified:** no model credentials were available. Deterministic SDK fixtures test the adapter contract, not a paid model call. To perform the pending manual check, configure `AGENT_MODE=claude`, `ANTHROPIC_API_KEY`, an operator-selected `AGENT_MODEL_ID`, and an isolated `AGENT_WORKSPACE_DIR`; run `npm run dev` and repeat a question, follow-up, low-turn run, and cancellation. Inspect the authenticated `GET /api/runs/{runId}` response for saved model and estimated usage.
- **Billed cost is unknown:** no authoritative billing integration was added. A response may cross an SDK cost threshold; the overflow allowance and reconciliation do not guarantee an invoice ceiling. Conservative crash accounting can overstate quota usage.
- **Context has explicit bounds:** history scanning stops at a 1,000-message safety boundary. Recent analysis excerpts are shortened and labeled; all requested scope and validated references must still fit or the run fails visibly.
- **Coverage is scoped:** the daily ledger covers interactive runs, including retries and subagents. Separately cached public article analysis retains its previous service limits.
- **Build warnings remain:** existing Vite directive/large-bundle warnings and three Next.js instrumentation/Edge warnings were observed despite a passing build.
- **Durable execution and deployment are later work:** background agent execution, cross-host SDK session artifacts, and distributed recovery remain milestones 27, 28, and 30. No public deployment or cloud resources were created. This workspace was not a Git repository; no commit or push was performed.

See [current project state](docs/project-state.md), [the milestone plan](docs/project-plan.md), and [project rules](AGENTS.md) before continuing to the next lesson.
