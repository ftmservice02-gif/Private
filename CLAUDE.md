# CLAUDE.md

Guidance for Claude Code (or any engineer) working in this repo: **IT Project
Board** — a Monday.com-style engineering/IT project tracker (multi-project
boards, task/subitem chat, Gantt dashboard, file uploads, EN/TH i18n).

## Architecture

Two independent processes, no build step, no framework:

```
Browser  ──fetch (Bearer token)──►  Express API (server/, :8790)  ──pg──►  PostgreSQL
   ▲
   └── static files served as-is (no bundler) ── python3 -m http.server (:8743)
```

- **Frontend**: plain multi-page HTML + vanilla JS (IIFEs), no framework, no
  build/bundle step. Each page is served directly as a static file.
- **Backend**: a single-file Express app (`server/server.js`) exposing a JSON
  REST API under `/api/*`, plus a static `/uploads` route for attachments.
  Talks to Postgres via `pg` with hand-written SQL (no ORM).
- **Database**: PostgreSQL. Schema lives in `server/schema.sql` and is applied
  idempotently (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT
  EXISTS`) — there is no migration-file/versioning system, just one additive
  schema file re-run on every deploy (see `server/migrate.js`).
- **Auth**: custom bearer-token sessions (bcrypt password hashes, a
  `sessions` table with expiry) — no external auth provider, no JWT.
- **State model**: each project's entire board (`groups` → `tasks` →
  `subitems`/`updates`) is edited client-side as one JS object (`PM.state`)
  and persisted as a whole via debounced `PUT /api/projects/:id/state`,
  which does a transactional delete-and-reinsert of `groups`/`tasks`/
  `subitems`/`updates` server-side. There is no per-field PATCH endpoint for
  board content.
- **Process management**: `ecosystem.config.js` (PM2) runs both processes in
  production — `pm-board-api` (the Express server) and `pm-board-static`
  (`python3 -m http.server 8743` serving the repo root).

## Folder structure

```
/                           repo root — also the static file server's document root
├── board.html              Main Kanban/table board for one project (largest page, ~2900 lines)
├── workspace.html           Workspace home: project list, create/import/delete projects, members
├── dashboard.html           Per-project report: status breakdown + Gantt chart
├── documents.html           Cross-project view of every file attached to task updates
├── users.html               Admin "Manage users" page (CRUD workspace members/roles)
├── login.html                Login / first-time password claim / initial admin bootstrap
├── engineer-pm-board.html   LEGACY: earlier monolithic single-file version of the app (predates
│                            the board/workspace/dashboard split + shared/). Not linked from any
│                            other page — kept for reference only, not part of the live app.
├── _check.js                Standalone copy of the old app's core logic (state/i18n/helpers),
│                            not `<script>`-included anywhere — used ad hoc with jsdomtest/ for
│                            offline sanity checks, not part of the served app.
├── jsdomtest/               Scratch package (jsdom dependency) for running _check.js outside a browser
├── ecosystem.config.js      PM2 process definitions for the API + static file server
├── fatima-logo.svg, fatima-f-mark.svg   Branding assets used across all pages
├── shared/
│   ├── shared.js            Core module: PM.* namespace — i18n dictionaries, state helpers,
│   │                        date/duration/Gantt math, auth (session storage, authFetch,
│   │                        requireAuth), save-status state machine, API client functions.
│   │                        Loaded by every page except login.html's setup flow.
│   ├── styles.css           Single shared stylesheet (CSS custom properties for theming) for all pages
│   ├── project-import.js    Excel (.xlsx/.xls), MS Project XML, and .mpp (via the server, see below)
│   │                        import → board {groups,tasks} shape
│   └── vendor/               Vendored third-party libs (no npm/CDN for these): pdf.js, Tesseract.js
│                            (+ tessdata for English/Thai OCR), SheetJS (xlsx.full.min.js) — used by
│                            workspace.html's "import from Excel/MSP-XML/PDF" flow (PDF text or OCR).
└── server/
    ├── server.js             Express app: all /api/* routes (see "Backend routes" below)
    ├── db.js                 pg Pool + a DATE type-parser fix (keeps dates as raw "YYYY-MM-DD" strings)
    ├── mpxj/                  Maven project (pom.xml + build.sh) that builds a shaded jar bundling
    │                        MPXJ (github.com/joniles/mpxj) — POST /api/import/mpp shells out to it
    │                        to convert an uploaded .mpp to MSPDI XML, which project-import.js then
    │                        parses with the same code path as a regular MS Project XML import.
    │                        target/ (the built jar, ~30MB) is gitignored — run mpxj/build.sh once
    │                        (needs a JDK 11+ and Maven) to enable .mpp import; without it the
    │                        endpoint returns a 501 telling the admin to run the build.
    ├── mailer.js              Nodemailer (Gmail SMTP) — project invite emails; no-ops if SMTP env vars unset
    ├── migrate.js             Runs schema.sql, then seeds server/seed-data.json if `projects` is empty
    ├── schema.sql             The entire DB schema (additive, idempotent — see "Database" above)
    ├── seed-data.json         Sample project data inserted by migrate.js on a first-ever run
    └── uploads/                (gitignored) task-update file attachments, served at /uploads/*
```

Each HTML page = shared sidebar/header markup + `shared/shared.js` (loaded via
`<script src="shared/shared.js">`) + its own inline `<script>` for
page-specific rendering/event wiring. There is no client-side router or SPA
shell — navigation is plain `<a href="board.html?id=...">` links.

## PostgreSQL schema

All tables use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` so `schema.sql`
can be re-run safely on every deploy against an existing database (see the
comments in the file itself — column/table ordering matters because of FK
dependencies, e.g. `users` must exist before anything referencing it).

| Table | Key columns | Notes |
|---|---|---|
| `users` | `id UUID`, `name`, `email`, `role` (`admin`/`member`/`viewer`), `password_hash`, `department` | Workspace members. `password_hash` nullable — an admin can create a user with no password and let them "claim" it later via `/api/auth/claim`. |
| `sessions` | `token TEXT PK`, `user_id → users`, `expires_at` | Bearer-token sessions, 30-day expiry (`SESSION_DAYS` in server.js). |
| `projects` | `id UUID`, `title`, `total_days_budget`, `created_by → users` | One row per project/board. |
| `groups` | `id TEXT PK` (client-generated, not UUID), `project_id → projects`, `name`, `color`, `collapsed`, `sort_order` | A board's columns/swimlanes. |
| `tasks` | `id TEXT PK`, `group_id → groups`, `name`, `owner`, `status`, `priority` (legacy, superseded by `folder`), `start_date`, `due_date`, `folder`, `stuck_reason`, `stuck_attachments JSONB` | `owner` is a free-text name, not a `users` FK. `status` values: `not_started`/`working`/`stuck`/`done` (see `PM.STATUS_ORDER`). |
| `subitems` | `id TEXT PK`, `task_id → tasks`, `name`, `owner`, `status`, `date`, `folder` (relative to parent task's folder), `stuck_reason`, `stuck_attachments JSONB` | Nested under a task; the board supports exactly one level of nesting. |
| `updates` | `id TEXT PK`, `task_id → tasks`, `subitem_id → subitems` (nullable), `author`, `time`, `text`, `likes`, `liked`, `is_html`, `parent_id` (self-referential, no FK) | The chat/comment thread on a task **or** a subitem (mutually exclusive via `subitem_id`). `parent_id` has no FK constraint deliberately — see the comment in `schema.sql` (updates are delete-and-reinsert in a batch, so a same-batch FK would break mid-transaction). |
| `project_members` | `(project_id, user_id)` composite PK | Per-project "Invite" list — a project with **zero** rows here is open to every signed-in user (opt-in access control; see `requireProjectAccess` in server.js). |
| `notifications` | `id UUID`, `to_user_id`, `from_user_id`, `project_id`, `task_id`, `message`, `read` | Created when someone `@mentions` a user in an update; surfaced in the sidebar bell. |

`pgcrypto` extension is required (`gen_random_uuid()` for UUID PKs).

## Running the dev server

Requires: Node.js, a running PostgreSQL instance, Python 3 (for the static
file server).

```bash
# 1. Backend — from server/
cd server
npm install
cp .env.example .env    # if present; otherwise create .env manually, see below
npm run migrate          # applies schema.sql, seeds sample data on first run
npm start                 # starts the API on http://localhost:8790

# 2. Frontend — from repo root, in another terminal
python3 -m http.server 8743   # serves the static HTML/JS/CSS on http://localhost:8743
```

Then open `http://localhost:8743/login.html` (first run: no users yet →
you'll be prompted to create the admin account).

**`server/.env` variables** (see `server/db.js`, `server/mailer.js`,
`server/server.js`):

| Var | Purpose | Required? |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Yes |
| `PORT` | API port | No (defaults to `8790`) |
| `SMTP_USER`, `SMTP_PASS` | Gmail SMTP creds (App Password) for project-invite emails | No — invite emails silently skip if unset |
| `APP_BASE_URL` | Base URL used to build the invite email's link | No (defaults to `http://localhost:8743`) |

**Production**: `pm2 start ecosystem.config.js` runs both the API and the
static file server as long-lived processes.

**Note**: `shared/shared.js` derives `PM.API_BASE` from
`window.location.hostname` (`http://<same-host>:8790/api`) rather than
hardcoding `localhost` — the API is assumed to always run on the same host
as the static frontend, one port over. A deploy behind a reverse proxy or
a split frontend/API host would need that line revisited; keep the
`APP_BASE_URL` env var in sync too, for invite email links.

**Optional: `.mpp` (native Microsoft Project) import** — the workspace
"Import from Excel, Microsoft Project (.mpp/.xml), or PDF" flow accepts
`.mpp` too, but it needs a one-time build:

```bash
cd server/mpxj
./build.sh   # needs a JDK 11+ and Maven; downloads MPXJ from Maven Central
```

Without this, `.xlsx`/`.xls`/`.xml`/`.pdf` import still works normally —
only `.mpp` uploads get a "not set up on this server yet" error
(`POST /api/import/mpp` returns 501). See `server/mpxj/pom.xml` for why the
built jar isn't just committed to the repo.

## Code conventions

- **No build step, no framework, no TypeScript.** Plain ES5-leaning
  vanilla JS (`var`, function expressions) targeting broad browser support.
  Don't introduce a bundler, JSX, or `let`/`const`-only style without
  discussing it first — it'd be inconsistent with the rest of the codebase.
- **Namespace pattern**: shared client logic lives on a single global `PM`
  object, defined inside an IIFE in `shared/shared.js`
  (`var PM = window.PM = {}`). Page-specific inline `<script>` blocks call
  `PM.xxx` rather than redefining shared logic. Follow this pattern for any
  new shared client-side utility.
- **CommonJS on the server** (`require`/`module.exports`), not ESM.
- **SQL is hand-written**, not an ORM/query-builder. Always use parameterized
  queries (`$1, $2, ...`) — never string-interpolate user input into SQL.
- **Schema changes are additive-only**: add new columns/tables to
  `server/schema.sql` guarded with `IF NOT EXISTS` / `ADD COLUMN IF NOT
  EXISTS`, with a one-line comment explaining *why* the migration exists
  (see existing examples). Never drop or rename a column in place — that
  breaks re-running `schema.sql` against older deployed databases. There is
  no migration-runner/versioning framework; `migrate.js` just re-executes
  the whole file every time.
- **IDs**: `users`/`projects`/`notifications` use `UUID` (`gen_random_uuid()`
  server-side). `groups`/`tasks`/`subitems`/`updates` use client-generated
  short random strings (`PM.uid()` — `Math.random().toString(36).slice(2,
  10)`), stored as `TEXT` PKs, because the client owns creating the whole
  board tree before it's ever saved.
- **Auth**: every protected route uses the `requireAuth` Express middleware
  (Bearer token → `sessions` join `users`); project-scoped routes add
  `requireProjectAccess` on top. Follow the same pattern for new routes
  rather than inlining auth checks.
- **i18n**: every user-facing string goes through `PM.I18N.en`/`PM.I18N.th`
  dictionaries in `shared/shared.js`, keyed by dotted names (e.g.
  `"board.addTask"`). Static markup uses `data-i18n="key"` /
  `data-i18n-placeholder="key"` attributes, applied by `PM.applyI18n()`.
  Dynamic strings call `PM.tr("key")` (with `{placeholder}` substitution via
  `.replace()`). Always add a string to **both** `en` and `th` dictionaries
  together, in the same position (the two objects are kept in parallel key
  order).
- **State persistence**: client-side board edits mutate `PM.state` directly,
  then call `PM.persist()` (debounced 600ms → localStorage + `PUT
  .../state`) or `PM.saveNow()` for an immediate flush (e.g. a manual Save
  button, `beforeunload`). Server-side, a save always does a full
  transactional delete-and-reinsert of that project's groups/tasks/
  subitems/updates (`saveProjectState` / `insertGroupsAndTasks` in
  server.js) — there's no incremental diffing, so keep payloads reasonably
  small and don't try to add partial-update endpoints without checking this
  assumption still holds.
- **Comments explain *why*, not *what***, especially around non-obvious
  schema/data-shape decisions (see `schema.sql`, `server.js`,
  `shared/shared.js` for the style to match) — keep doing this for
  non-obvious logic you add.
- **Legacy/dev-only files** (`engineer-pm-board.html`, `_check.js`,
  `jsdomtest/`) are not part of the live app and aren't linked from
  anywhere — don't edit them expecting changes to show up in the real
  pages; the real pages are `login.html`, `workspace.html`, `board.html`,
  `dashboard.html`, `documents.html`, `users.html` + `shared/`.
