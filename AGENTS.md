# Briefing for coding agents (Codex)

Read this whole file before changing anything. It says what this app is, what
we are moving it to, the order of work, and the rules that must not be broken.
When something here is unclear or a rule would have to be broken, stop and ask
the person you are working with.

## What this app is

The Meade CPA Financial Data Platform is an internal, staff-only tool for
Meade CPA, an accounting and tax firm. Staff link clients' bank accounts
through Plaid (transactions, investments, liabilities), upload client
documents, and export data. Staff can download a CSV of the Plaid data and
bring it into TaxDome by hand; there is no automatic hand-off. Uploaded
documents are not part of that export. They stay in the app (Azure Blob today,
the VM's disk later), and there is no plan yet to send them to TaxDome. Treat all data as
confidential financial and tax data. Today all data in the database is test
data, but write everything as if it were real.

## What exists today (Azure)

- `frontend/`: React 18 + TypeScript (Create React App), MUI. Calls `/api/*`.
  Login, logout and "who am I" use Azure's `/.auth/me`, `/.auth/login/aad` and
  `/.auth/logout` (see `frontend/src/App.tsx`).
- `api/`: Azure Functions (v3 programming model, `@azure/functions` 3.x),
  Node + TypeScript. One folder per function with a `function.json` and an
  `index.ts`. Routes: `clients`, `clients/{clientId}/items`, `documents`,
  `upload-url`, `export-client-data`, `items`, `link-sessions`,
  `plaid/link-token`, `plaid/webhook`, `transactions` (+ sync),
  `investments` (+ sync), `liabilities`, `ping`, and `sandbox/test`.
  Shared code is in `api/shared/`:
  - `database.ts`: SQL Server access through `mssql`.
  - `storage.ts`: Azure Blob Storage (upload link, read first bytes, SHA-256,
    delete, exists).
  - `auth.ts`: reads the `x-ms-client-principal` header Azure adds.
  - `http.ts`, `safe-log.ts`, `encryption.ts`, `plaid-client.ts`,
    `webhook-verification.ts`, `upload-validation.ts`, and the sync services.
  `api/dist/` is build output (`npm run build` in `api/`), not source.
- Database: Azure SQL (T-SQL). See "Database" below.
- Files: Azure Blob Storage. The browser uploads straight to Blob with a
  15-minute write-only link; `/api/documents` then confirms the upload.
- Hosting and login: Azure Static Web Apps.
  `frontend/public/staticwebapp.config.json` requires login on every route
  except `/api/ping`, `/api/plaid/webhook`, `/bank/link-complete` and
  `/access-denied`.
- Deploy: a GitHub workflow in `.github/workflows/` deploys the `sandbox`
  branch to Azure.
- Settings the API reads from the environment: `PLAID_ENV`, `PLAID_CLIENT_ID`,
  `PLAID_SECRET`, `PLAID_WEBHOOK_URL`, `PLAID_REDIRECT_URI_BASE`,
  `AZURE_SQL_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`,
  `ALLOWED_ORIGIN`, `UPLOAD_MAX_BYTES`, `UPLOAD_ALLOWED_EXTENSIONS`,
  `ALLOW_DEV_AUTH_BYPASS`. The dev auth bypass must never exist in production.

## What we are building

The same app, running on the Ubuntu VM `meade-platform01` in Meade CPA's
office (`10.99.9.123`), with no Azure dependencies. We do not need to settle
every detail now. Many things will be changed as we go, so when something below
is marked provisional, confirm it with the person you are working with before
depending on it.

| Piece | Today | New |
| --- | --- | --- |
| Frontend | Azure Static Web Apps | Served by the app's own Node server |
| API | Azure Functions | Node server on the VM, listening on `127.0.0.1` only |
| Database | Azure SQL | PostgreSQL on the VM |
| Files | Azure Blob Storage | A folder on the VM's disk |
| Login | Entra through Azure | Cloudflare Access with Microsoft Entra |
| Publishing | Azure | Cloudflare Tunnel (`cloudflared`) to `meadecpa.tax` |
| Deploy | Azure workflow | GitHub, pulled onto the VM |

Two copies run on the VM, each with its own database, files folder, settings
and Plaid keys. **Build and go live with sandbox first.** Production is set up
only after sandbox has passed testing:

| | Sandbox | Production |
| --- | --- | --- |
| Git branch | `sandbox` | `main` |
| Address (provisional) | `sandbox.meadecpa.tax` | `app.meadecpa.tax` |
| Plaid keys | Plaid sandbox | Plaid production |

PostgreSQL is the likely database, but this is provisional. Confirm it, and
how to install it (directly or in Docker, which is waiting on the IT contact),
with the person you are working with before installing anything.

## Order of work

1. Prepare the VM: Node, PostgreSQL (once confirmed), a service account for
   the app (no admin rights), folders, firewall.
2. Get a sandbox address working early: a placeholder page behind the tunnel
   for the sandbox address. Dashboard settings (tunnel routes, Access
   applications) are done by the person you are working with, in the
   Cloudflare dashboard, not by you. Tell them exactly what to enter (the
   hostname and the local address, such as `http://localhost:PORT`).
3. Deploy from GitHub: `sandbox` updates the sandbox copy, running as a service
   that restarts after a reboot. `main` and production come later (step 8).
4. Run on Linux: replace the Azure Functions host with a small Node server
   that also serves the built frontend. Keep every route and response shape
   the same so the frontend barely changes. `sandbox/test` is a test-only
   route; ask before porting it.
5. Database: PostgreSQL schema in its final form, replace `mssql` with `pg`,
   rewrite the queries, keep the tests passing.
6. Files: store uploads in a folder on disk with the same path layout as
   `buildBlobPath` in `api/shared/storage.ts`.
7. Login in the app: verify Cloudflare Access (see "Login").
8. Test on sandbox, including the Plaid webhook and the Plaid return page
   (`/bank/link-complete`). Only after sandbox passes, set up production as a
   copy: its own database, files folder, settings, Plaid production keys and
   URLs, and nightly backups of the database and files folder to somewhere off
   the VM.
9. Documentation, written as each step lands (see "Documentation").

Pending security patches are being handled separately. Do not try to apply or
recreate them, and do not remove any existing security behavior.

## Rules that must not be broken

Git
- Never commit to `main` or `sandbox`. Work on a `feature/...` branch and open
  a pull request into `sandbox`. The person you are working with reviews and
  merges it.
- Small commits, clear messages, no force pushes, no rewriting shared history.

Secrets and data
- Never commit secrets: `.env` files, passwords, tokens, connection strings,
  keys, Codex's `~/.codex/auth.json`. Settings come from environment variables
  or a settings file outside the repo.
- Never print secrets in output, logs or commit messages. Keep using
  `api/shared/safe-log.ts`; logs must not contain tokens, emails or client
  names.
- The files folder is outside the repo and outside anything served over the
  web. It is owned by the app's service account and not readable by others.

Network
- The app listens on `127.0.0.1` only. Never open an inbound port. The only
  way in from the internet is the Cloudflare Tunnel, with Cloudflare Access in
  front.

Other things on this VM
- This VM runs other people's things too (an IT demo, Paperless, and the
  `cloudflared` connector that carries their addresses). Do not touch them.
  Never stop, restart, reconfigure or reinstall `cloudflared`: that would take
  down their addresses. Use only this app's own folders, database, service
  user and ports.
- `sudo` is available. Use it only for steps in the plan (installing Node or
  PostgreSQL, creating the app's service and folders). Say what you are about
  to run first.

Ask first
- Codex may run without approval prompts, so this list is the guardrail. Stop
  and ask before: deleting data or files, changing the firewall, installing
  system packages that are not in the plan, running anything as root, changing
  any Cloudflare setting, or touching anything that is not this app's.
- Do not run Codex or the app as root.

## Behavior to keep

- Upload checks: allowed file types and a 50 MB maximum
  (`api/shared/upload-validation.ts`), real contents checked from the first
  bytes, SHA-256 recomputed on the server, duplicates detected by client + tax
  year + checksum, bad files deleted. The tax year is required and chosen by
  staff.
- Errors return "Internal server error" plus a reference number, with details
  only in the logs.
- The API accepts browser requests from the same site only (`ALLOWED_ORIGIN`).
- Plaid access tokens stay encrypted at rest (`api/shared/encryption.ts`).
- `/api/plaid/webhook` and the page `/bank/link-complete` (where Plaid sends
  the client back after linking) are reachable without a login. Every webhook
  request is verified by Plaid's signature
  (`api/shared/webhook-verification.ts`).
- `PLAID_WEBHOOK_URL` and `PLAID_REDIRECT_URI_BASE` must be changed to the
  `meadecpa.tax` addresses for each copy. Plaid also has to be told the same
  addresses; the person you are working with does that.
- Deleting and archiving: keep the behavior described in
  `docs/DATA-LIFECYCLE.md`. Do not add real deletion, cascades or a purge, and
  do not "fix" gaps in those flows unless asked. Mention them in the pull
  request instead.

## Login

Staff sign in through Cloudflare Access with Microsoft Entra. For now, any
Meade CPA account (emails ending in `@meadecpa.tax`) is allowed in; this may
be narrowed later. Cloudflare Access already blocks other people before they
reach the app, and the app checks again. In the app:
- Verify the `Cf-Access-Jwt-Assertion` token on every `/api` call except
  `/api/ping` and `/api/plaid/webhook`: signature from the team's public keys,
  correct audience, not expired. Use `jose` (already a dependency). Replace the
  `x-ms-client-principal` handling in `api/shared/auth.ts`.
- In the frontend, replace the `/.auth/*` calls in `frontend/src/App.tsx`
  (Access provides `/cdn-cgi/access/get-identity` and
  `/cdn-cgi/access/logout`).
- Let `/bank/link-complete` and the `/access-denied` page load without a
  login, as they do today. Everything else needs one.
- Remove `ALLOW_DEV_AUTH_BYPASS`, or make it impossible to enable outside a
  local development run. Today the bypass is only blocked when the code
  detects it is running in Azure (`WEBSITE_INSTANCE_ID`), which will not be
  set on the VM, so leaving it as is would make it possible to turn on there.

## Database

PostgreSQL is the likely choice; confirm before installing.

- The full Azure schema is in `database/schema/azure-sql-schema.md`
  (17 tables, indexes, foreign keys, views). `database/schema/postgres-draft.sql`
  is a draft translation that loads into PostgreSQL but has not been tested
  against the app. Treat it as a starting point and review it. There is no
  migrations folder on this branch; the live Azure schema (as exported into
  `database/schema/`) is the truth.
- No data needs to be moved. Start empty; Plaid accounts get linked again.
- Foreign keys block deleting a parent row that still has children, and the app
  archives instead of deleting (see `docs/DATA-LIFECYCLE.md`). Keep both.
- Encryption keys are stored in the database table `encryption_keys` today.
  Do not change how keys or tokens are stored without asking.
- T-SQL to PostgreSQL: `TOP n` to `LIMIT n`, `GETDATE()` to `now()`,
  `NEWID()` to `gen_random_uuid()`, `NVARCHAR` to `text` or `varchar`, `BIT` to
  `boolean`, `DATETIME2` to `timestamptz`, `OUTPUT` to `RETURNING`, named
  `@param` to `$1`, `ISNULL` to `COALESCE`, `DATEADD` to interval arithmetic,
  string `+` to `||`, and
  `STRING_AGG(x, ',') WITHIN GROUP (ORDER BY y)` to
  `string_agg(x, ',' ORDER BY y)`. Search `api/` for anything else T-SQL
  specific before you start.

## Checks before every pull request

Automatic checks:
- `cd api && npm run build` passes, and `cd frontend && npm run build` passes.
- Tests: some already fail today and are not yours to fix, so do not count
  them against your change. In `api/`: `__tests__/database-cascade.test.ts`,
  `__tests__/foreign-keys.test.ts`, `__tests__/error-handling.test.ts` and
  `items/index.test.ts` (22 tests; most get a 401 because the tests send no
  login, and `error-handling` cannot load `jose`). In `frontend/`:
  `src/App.test.tsx` (4 tests, looking for old text). Everything else in
  `cd api && npm test` and `cd frontend && CI=true npm test` must pass, and you
  must not make any other test fail. When your change replaces the login
  (step 7), update the failing API tests as part of that pull request.
- No secrets in the diff (`git diff` read through once).

The pull request description must say:
- What changed, and how you tested it.
- What to click: a short numbered list of things the person you are working
  with should try on the sandbox site after it is merged (for example: sign in,
  open a client, upload a file, remove a bank connection). A step is not done
  until they have clicked through it.
- How to undo it.
- Anything that needs a change in Cloudflare or on the VM, spelled out.

## Documentation

Keep `docs/` accurate as you go, in plain language that anyone can follow, not
only programmers. For each step, record: how to deploy, how to restore from a
backup, how to add a staff member, every setting and secret (name, what it
does, where it is set, never its value), and how to roll back. Update
`README.md` when its description of Azure no longer matches reality.
