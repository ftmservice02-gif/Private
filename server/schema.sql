CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_days_budget INTEGER
);

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
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subitems (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner TEXT,
  status TEXT,
  date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author TEXT,
  time TIMESTAMPTZ,
  text TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  liked BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0
);

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

-- Who's been invited onto a given project's board (the "Invite / N" picker).
-- Distinct from workspace membership (users table) — a project only shows
-- a subset of workspace members here, picked explicitly.
CREATE TABLE IF NOT EXISTS project_members (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE EXTENSION IF NOT EXISTS pgcrypto;
