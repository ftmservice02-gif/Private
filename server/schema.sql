CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- users/sessions come first: projects.created_by and several other tables
-- below reference users(id), so the table has to exist before anything
-- that points at it is created (this ordering matters on a fresh database —
-- an existing database just no-ops on the IF NOT EXISTS/IF NOT EXISTS ADD).
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  password_hash TEXT,
  department TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive migration for databases created before password_hash existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
-- Additive migration for databases created before department existed
-- (used to group the Manage users table like the source HR/handover system).
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_days_budget INTEGER,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Additive migration for databases created before created_by existed —
-- workspace.html's "Creator" column needs a real name, not a generic icon.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Additive migration for databases created before total_days_budget existed.
-- CREATE TABLE IF NOT EXISTS above is a no-op on an existing table, so the
-- column needs its own idempotent statement to reach already-provisioned DBs.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_days_budget INTEGER;

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  collapsed BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner TEXT,
  status TEXT,
  priority TEXT,
  start_date DATE,
  due_date DATE,
  subitems_open BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  folder TEXT
);

-- Additive migration for databases created before the board's Priority
-- column was replaced with a free-form Folder tag. The old `priority`
-- column and its data are left in place (not read/written by the UI
-- anymore, but not destroyed either).
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS folder TEXT;

-- Free-form note explaining why a task is Stuck, entered via the warning
-- icon next to the Stuck pill. Kept even if the status later changes away
-- from Stuck, so it's restored if it's set back.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stuck_reason TEXT;

-- Photos/files attached to the stuck reason (same uploads pipeline as chat
-- attachments). Small, row-scoped list that's never queried on its own, so
-- it's kept as JSONB instead of a join table: [{id, url, name, size, mime}].
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS stuck_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS subitems (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner TEXT,
  status TEXT,
  date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  folder TEXT
);

-- Subitem folder is stored *relative* to its parent task (e.g. "Configs",
-- not "Task Name/Configs") so it stays correct if the task is later
-- renamed — the parent task's own folder is always its current name, and
-- the subitem's path is computed as task.folder + "/" + subitem.folder.
ALTER TABLE subitems ADD COLUMN IF NOT EXISTS folder TEXT;
ALTER TABLE subitems ADD COLUMN IF NOT EXISTS stuck_reason TEXT;
ALTER TABLE subitems ADD COLUMN IF NOT EXISTS stuck_attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT,
  time TIMESTAMPTZ,
  text TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  liked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_html BOOLEAN NOT NULL DEFAULT false,
  parent_id TEXT
);

-- Additive migration for databases created before the rich-text compose
-- box existed. true = text is sanitized HTML from the formatting toolbar
-- and should be rendered as-is; false (legacy rows) = plain text and must
-- still be HTML-escaped at render time.
ALTER TABLE updates ADD COLUMN IF NOT EXISTS is_html BOOLEAN NOT NULL DEFAULT false;
-- Additive migration for threaded replies. NULL = top-level update; set =
-- this row is a reply nested under the update with that id (same task).
-- No FK — updates are delete-and-reinsert together as a batch on every
-- save, so a same-batch parent_id would violate a FK mid-transaction.
ALTER TABLE updates ADD COLUMN IF NOT EXISTS parent_id TEXT;

-- Additive migration: a subitem gets its own independent Updates
-- panel/chat, same as a task. NULL = this row belongs to the task itself
-- (existing behavior, unchanged); set = this row belongs to that subitem
-- instead — task_id still points at the subitem's parent task (kept for
-- the "SELECT ... WHERE task_id = ANY($1)" bulk-load query), subitem_id
-- narrows it down to the specific subitem.
ALTER TABLE updates ADD COLUMN IF NOT EXISTS subitem_id TEXT REFERENCES subitems(id) ON DELETE CASCADE;

-- Who's been invited onto a given project's board (the "Invite / N" picker).
-- Distinct from workspace membership (users table) — a project only shows
-- a subset of workspace members here, picked explicitly.
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

-- @mentions in task updates land here so the tagged person sees it on
-- their own account (sidebar bell), not just buried in the task's thread.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  task_id TEXT,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
