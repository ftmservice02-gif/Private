require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const multer = require("multer");
const { parseIcs, expandEvents } = require("./gcal");
const pool = require("./db");
const { sendProjectInviteEmail } = require("./mailer");
const { runReminderCheck, getSettings: getReminderSettings, updateSettings: updateReminderSettings } = require("./reminders");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ---------------- auth ----------------

const SESSION_DAYS = 30;

function bearerToken(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Rejects unless a valid, unexpired session token is presented.
async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = $1 AND s.expires_at > now()`,
      [token]
    );
    if (!result.rows.length) return res.status(401).json({ error: "Session expired" });
    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Auth check failed" });
  }
}

// Same as requireAuth, except the very first user (empty workspace) can be
// created without a session — someone has to be able to log in eventually.
async function requireAuthUnlessBootstrap(req, res, next) {
  try {
    const count = await pool.query("SELECT count(*)::int AS n FROM users");
    if (count.rows[0].n === 0) return next();
  } catch (err) {
    console.error(err);
  }
  return requireAuth(req, res, next);
}

// Blocks the "viewer" role from any write route — viewer is meant to be
// read-only everywhere in the app (board/dashboard/documents still fully
// viewable, nothing here touches GET routes), while "member" keeps every
// edit right it already had. Checked before requireProjectAccess on
// project routes since there's no reason to also look up membership for a
// request that's getting rejected regardless. Must run after requireAuth.
function requireEditor(req, res, next) {
  if (req.user.role === "viewer") return res.status(403).json({ error: "Viewers have read-only access" });
  next();
}

// Manage Users' actual write routes (create/edit/delete an account, which
// includes handing out roles) — admin-only, no exceptions. Must run after
// requireAuth.
function requireAdmin(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  next();
}

// Gates a project's state/members routes (req.params.id) to admins and
// invited members — the creator counts as invited too, since POST
// /api/projects (below) always adds them to project_members on creation,
// and schema.sql backfills that same row for every project that predates
// that insert, so "invited members" already covers "the project's owner"
// without a separate check here. A project with nobody in project_members
// is *not* open to everyone else — used to be, deliberately, to avoid an
// instant lockout the day this table was introduced, but per-project access
// is meant to actually be private now, not opt-in. Must run after
// requireAuth (needs req.user).
async function requireProjectAccess(req, res, next) {
  if (req.user.role === "admin") return next();
  const projectId = req.params.id;
  try {
    const memberRows = await pool.query("SELECT user_id FROM project_members WHERE project_id = $1", [projectId]);
    const isMember = memberRows.rows.some((r) => r.user_id === req.user.id);
    if (isMember) return next();
    return res.status(403).json({ error: "You don't have access to this project" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to verify project access" });
  }
}

app.get("/api/auth/bootstrap-check", async (req, res) => {
  try {
    const count = await pool.query("SELECT count(*)::int AS n FROM users");
    res.json({ needsSetup: count.rows[0].n === 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to check setup state" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const identifier = ((req.body && req.body.identifier) || (req.body && req.body.email) || "").trim().toLowerCase();
  const password = (req.body && req.body.password) || "";
  if (!identifier || !password) return res.status(400).json({ error: "Name or email, and password, are required" });
  try {
    // Prefer an exact email match (unambiguous by definition); only fall
    // back to matching by name for accounts that don't have an email set,
    // and refuse to guess if more than one name collides.
    const byEmail = await pool.query("SELECT * FROM users WHERE lower(email) = $1", [identifier]);
    let user = byEmail.rows[0];
    if (!user) {
      const byName = await pool.query("SELECT * FROM users WHERE lower(name) = $1", [identifier]);
      if (byName.rows.length === 1) user = byName.rows[0];
    }
    if (!user || !user.password_hash) return res.status(401).json({ error: "Invalid email or password" });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid email or password" });
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
    await pool.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [token, user.id, expiresAt]);
    res.json({ token, user: toUserJson(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const token = bearerToken(req);
  if (token) {
    try { await pool.query("DELETE FROM sessions WHERE token = $1", [token]); } catch (err) { console.error(err); }
  }
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Lets an existing user who has no password yet (e.g. added via Manage Users
// before this account had passwords, or invited by an admin) set their first
// password and log straight in. Matches by email OR name, since accounts
// created before email was required may not have one set yet — an email
// passed here fills that in as part of claiming. Safe with no auth: it only
// ever succeeds against an account with password_hash still NULL — there's
// no secret to bypass, since one was never set.
app.post("/api/auth/claim", async (req, res) => {
  const identifier = (req.body && req.body.identifier || "").trim();
  const email = (req.body && req.body.email || "").trim().toLowerCase();
  const password = (req.body && req.body.password) || "";
  if (!identifier || !password) return res.status(400).json({ error: "Name or email, and password, are required" });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const lower = identifier.toLowerCase();
    const result = await pool.query(
      "SELECT * FROM users WHERE password_hash IS NULL AND (lower(email) = $1 OR lower(name) = $1)",
      [lower]
    );
    if (!result.rows.length) return res.status(404).json({ error: "No unclaimed account matches that name or email" });
    if (result.rows.length > 1) return res.status(409).json({ error: "Multiple accounts match that name — ask an admin to set your email first" });
    const user = result.rows[0];
    const hash = await bcrypt.hash(password, 10);
    const updated = await pool.query(
      "UPDATE users SET password_hash = $1, email = COALESCE(NULLIF($2, ''), email), updated_at = now() WHERE id = $3 RETURNING *",
      [hash, email, user.id]
    );
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
    await pool.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)", [token, user.id, expiresAt]);
    res.json({ token, user: toUserJson(updated.rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not set password" });
  }
});

async function getOrCreateDefaultProjectId() {
  const existing = await pool.query("SELECT id FROM projects ORDER BY created_at ASC LIMIT 1");
  if (existing.rows.length) return existing.rows[0].id;
  const created = await pool.query(
    "INSERT INTO projects (title) VALUES ($1) RETURNING id",
    ["New IT Project"]
  );
  return created.rows[0].id;
}

async function loadProjectState(projectId) {
  const project = await pool.query(
    `SELECT p.*, u.name AS creator_name FROM projects p LEFT JOIN users u ON u.id = p.created_by WHERE p.id = $1`,
    [projectId]
  );
  if (!project.rows.length) return null;

  const groups = await pool.query(
    "SELECT * FROM groups WHERE project_id = $1 ORDER BY sort_order ASC",
    [projectId]
  );
  const tasks = await pool.query(
    `SELECT t.* FROM tasks t JOIN groups g ON t.group_id = g.id
     WHERE g.project_id = $1 ORDER BY t.sort_order ASC`,
    [projectId]
  );
  const taskIds = tasks.rows.map((t) => t.id);
  const subitems = taskIds.length
    ? await pool.query(
        "SELECT * FROM subitems WHERE task_id = ANY($1) ORDER BY sort_order ASC",
        [taskIds]
      )
    : { rows: [] };
  const updates = taskIds.length
    ? await pool.query(
        "SELECT * FROM updates WHERE task_id = ANY($1) ORDER BY sort_order ASC",
        [taskIds]
      )
    : { rows: [] };

  // A row with subitem_id set belongs to that subitem's own updates panel,
  // not the parent task's — split them into two lookups up front so a
  // task's `.updates` never includes its subitems' chats and vice versa.
  const updatesByTask = {};
  const updatesBySubitem = {};
  for (const u of updates.rows) {
    const bucket = u.subitem_id ? (updatesBySubitem[u.subitem_id] = updatesBySubitem[u.subitem_id] || []) : (updatesByTask[u.task_id] = updatesByTask[u.task_id] || []);
    bucket.push({
      id: u.id,
      author: u.author || "",
      time: u.time ? u.time.toISOString() : "",
      text: u.text || "",
      likes: u.likes,
      liked: u.liked,
      isHtml: !!u.is_html,
      parentId: u.parent_id || null,
    });
  }

  const subitemsByTask = {};
  for (const s of subitems.rows) {
    (subitemsByTask[s.task_id] = subitemsByTask[s.task_id] || []).push({
      id: s.id,
      name: s.name,
      owner: s.owner || "",
      status: s.status,
      date: s.date || "",
      folder: s.folder || "",
      stuckReason: s.stuck_reason || "",
      stuckAttachments: s.stuck_attachments || [],
      updates: updatesBySubitem[s.id] || [],
    });
  }

  const tasksByGroup = {};
  for (const t of tasks.rows) {
    (tasksByGroup[t.group_id] = tasksByGroup[t.group_id] || []).push({
      id: t.id,
      groupId: t.group_id,
      name: t.name,
      owner: t.owner || "",
      status: t.status,
      priority: t.priority,
      folder: t.folder || "",
      stuckReason: t.stuck_reason || "",
      stuckAttachments: t.stuck_attachments || [],
      start: t.start_date || "",
      due: t.due_date || "",
      subitemsOpen: t.subitems_open,
      subitems: subitemsByTask[t.id] || [],
      updates: updatesByTask[t.id] || [],
    });
  }

  return {
    id: project.rows[0].id,
    title: project.rows[0].title,
    createdAt: project.rows[0].created_at,
    updatedAt: project.rows[0].updated_at,
    totalDaysBudget: project.rows[0].total_days_budget,
    creatorName: project.rows[0].creator_name || "",
    groups: groups.rows.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      collapsed: g.collapsed,
    })),
    tasks: groups.rows.flatMap((g) => tasksByGroup[g.id] || []),
  };
}

// Shared by saveProjectState (whole-board re-save) and the "create project
// from an imported file" path — both need to turn the same client-side
// {groups, tasks} shape into rows, so the insert logic lives in one place
// rather than being duplicated and risking drift between the two callers.
async function insertGroupsAndTasks(client, projectId, groups, tasks) {
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    await client.query(
      `INSERT INTO groups (id, project_id, name, color, collapsed, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [g.id, projectId, g.name, g.color || null, !!g.collapsed, gi]
    );
  }

  for (let ti = 0; ti < tasks.length; ti++) {
    const t = tasks[ti];
    await client.query(
      `INSERT INTO tasks (id, group_id, name, owner, status, priority, start_date, due_date, subitems_open, sort_order, folder, stuck_reason, stuck_attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        t.id,
        t.groupId,
        t.name,
        t.owner || null,
        t.status || null,
        t.priority || null,
        t.start || null,
        t.due || null,
        !!t.subitemsOpen,
        ti,
        t.folder || null,
        t.stuckReason || null,
        JSON.stringify(Array.isArray(t.stuckAttachments) ? t.stuckAttachments : []),
      ]
    );

    const subitems = Array.isArray(t.subitems) ? t.subitems : [];
    for (let si = 0; si < subitems.length; si++) {
      const s = subitems[si];
      await client.query(
        `INSERT INTO subitems (id, task_id, name, owner, status, date, sort_order, folder, stuck_reason, stuck_attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [s.id, t.id, s.name, s.owner || null, s.status || null, s.date || null, si, s.folder || null, s.stuckReason || null, JSON.stringify(Array.isArray(s.stuckAttachments) ? s.stuckAttachments : [])]
      );

      // A subitem gets its own independent Updates panel/chat — same
      // shape as a task's, just tagged with subitem_id so it doesn't mix
      // into the parent task's own thread (see loadProjectState above).
      const subUpdates = Array.isArray(s.updates) ? s.updates : [];
      for (let sui = 0; sui < subUpdates.length; sui++) {
        const u = subUpdates[sui];
        await client.query(
          `INSERT INTO updates (id, task_id, subitem_id, author, time, text, likes, liked, sort_order, is_html, parent_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            u.id,
            t.id,
            s.id,
            u.author || null,
            u.time || null,
            u.text || null,
            u.likes || 0,
            !!u.liked,
            sui,
            !!u.isHtml,
            u.parentId || null,
          ]
        );
      }
    }

    const updates = Array.isArray(t.updates) ? t.updates : [];
    for (let ui = 0; ui < updates.length; ui++) {
      const u = updates[ui];
      await client.query(
        `INSERT INTO updates (id, task_id, author, time, text, likes, liked, sort_order, is_html, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          u.id,
          t.id,
          u.author || null,
          u.time || null,
          u.text || null,
          u.likes || 0,
          !!u.liked,
          ui,
          !!u.isHtml,
          u.parentId || null,
        ]
      );
    }
  }
}

async function saveProjectState(projectId, state) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      "UPDATE projects SET title = $1, total_days_budget = $2, updated_at = now() WHERE id = $3",
      [state.title || "Untitled Project", state.totalDaysBudget || null, projectId]
    );

    // Delete-and-reinsert: simplest way to keep the relational tables in
    // sync with the single JSON blob the client edits and saves as a whole.
    await client.query(`DELETE FROM groups WHERE project_id = $1`, [projectId]);

    await insertGroupsAndTasks(client, projectId, state.groups, state.tasks);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------- multi-project routes ----------------

app.get("/api/projects", requireAuth, async (req, res) => {
  try {
    // Non-admins only see projects they've been explicitly added to
    // (project_members) — mirrors requireProjectAccess. The creator is
    // always in there too (see the comment above requireProjectAccess).
    const isAdmin = req.user.role === "admin";
    const result = await pool.query(
      `SELECT p.id, p.title, p.created_at, p.updated_at, p.created_by, u.name AS creator_name,
              COUNT(t.id)::int AS task_count,
              COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_count
       FROM projects p
       LEFT JOIN groups g ON g.project_id = p.id
       LEFT JOIN tasks t ON t.group_id = g.id
       LEFT JOIN users u ON u.id = p.created_by
       WHERE $1
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2)
       GROUP BY p.id, p.created_by, u.name
       ORDER BY p.created_at ASC`,
      [isAdmin, req.user.id]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        title: r.title,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        createdBy: r.created_by,
        creatorName: r.creator_name || "",
        taskCount: r.task_count,
        doneCount: r.done_count,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list projects" });
  }
});

// Sidebar "Progress" card's default (no single project selected) view —
// every task across every project the current user can actually see
// (same visibility rule as the project list above), combined. When a
// specific project IS open (board.html/dashboard.html), the client shows
// that project's own progress instead, computed from the state it already
// has loaded — this endpoint only covers the "no project selected" case.
app.get("/api/all-projects-progress", requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const result = await pool.query(
      `SELECT COUNT(t.id)::int AS total, COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done
       FROM projects p
       JOIN groups g ON g.project_id = p.id
       JOIN tasks t ON t.group_id = g.id
       WHERE ($1
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2))`,
      [isAdmin, req.user.id]
    );
    res.json({ done: result.rows[0].done, total: result.rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// Every dated task across the projects this user can see, for calendar.html —
// same visibility rule as /api/all-projects-progress above (admins see all,
// everyone else only projects they're a member of). Tasks with neither a
// start nor a due date have nothing to place on a calendar, so they're left out.
app.get("/api/calendar-events", requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin";
    const result = await pool.query(
      `SELECT t.id, t.name, t.owner, t.status, t.start_date, t.due_date,
              p.id AS project_id, p.title AS project_title
       FROM projects p
       JOIN groups g ON g.project_id = p.id
       JOIN tasks t ON t.group_id = g.id
       WHERE (t.start_date IS NOT NULL OR t.due_date IS NOT NULL)
         AND ($1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2))
       ORDER BY COALESCE(t.start_date, t.due_date), t.name`,
      [isAdmin, req.user.id]
    );
    res.json(result.rows.map((r) => ({
      id: r.id, name: r.name, owner: r.owner || "", status: r.status || "not_started",
      startDate: r.start_date, dueDate: r.due_date, projectId: r.project_id, projectTitle: r.project_title,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load calendar events" });
  }
});

// Task/subitem updates (the chat/comment thread) within a date range, for the
// calendar's optional "updates & comments" layer — same project visibility as
// /api/calendar-events. The range is required and capped at 62 days so this
// never tries to ship a whole workspace's history in one response. Rich-text
// updates are stored as HTML, so tags are stripped here and the text cut to a
// one-line preview; the client only ever renders it as plain text.
app.get("/api/calendar-updates", requireAuth, async (req, res) => {
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: "from and to (YYYY-MM-DD) are required" });
  if ((new Date(to) - new Date(from)) / 86400000 > 62) return res.status(400).json({ error: "Range too large" });
  try {
    const isAdmin = req.user.role === "admin";
    const result = await pool.query(
      `SELECT u.id, u.author, u.time, u.text, u.is_html, t.id AS task_id, t.name AS task_name,
              p.id AS project_id, p.title AS project_title
       FROM projects p
       JOIN groups g ON g.project_id = p.id
       JOIN tasks t ON t.group_id = g.id
       JOIN updates u ON u.task_id = t.id
       WHERE u.time::date >= $3::date AND u.time::date <= $4::date
         AND ($1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2))
       ORDER BY u.time`,
      [isAdmin, req.user.id, from, to]
    );
    res.json(result.rows.map((r) => {
      const plain = String(r.text || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const d = new Date(r.time);
      const pad = (n) => String(n).padStart(2, "0");
      return {
        id: r.id, author: r.author || "", date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        text: plain.slice(0, 140), taskId: r.task_id, taskName: r.task_name,
        projectId: r.project_id, projectTitle: r.project_title,
      };
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load updates" });
  }
});

// ---- Google Calendar import (iCal feed) ----
// An admin pastes Google Calendar's "Secret address in iCal format" once; the
// server fetches and parses that feed on demand (no OAuth, nothing copied into
// the database, so it stays live). The URL is itself a credential — anyone
// holding it can read the calendar — so only admins can read or change it, and
// only https://calendar.google.com/ URLs are accepted, which also keeps this
// from being usable to make the server fetch arbitrary internal addresses.
const GOOGLE_ICAL_KEY = "google_ical_url";
function isGoogleIcalUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && x.hostname === "calendar.google.com";
  } catch (e) { return false; }
}
let icalCache = { url: "", at: 0, events: [] };
async function loadGoogleEvents(url) {
  if (icalCache.url === url && Date.now() - icalCache.at < 5 * 60 * 1000) return icalCache.events;
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error("Google returned " + r.status);
  const text = await r.text();
  if (text.length > 15 * 1024 * 1024) throw new Error("Calendar feed too large");
  const events = parseIcs(text);
  icalCache = { url, at: Date.now(), events };
  return events;
}

app.get("/api/settings/google-calendar", requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT key, value FROM app_settings WHERE key = ANY($1)", [[GOOGLE_ICAL_KEY, ICS_NAME_KEY]]);
    const by = {}; r.rows.forEach((x) => { by[x.key] = x.value; });
    const url = by[GOOGLE_ICAL_KEY] || "", icsName = by[ICS_NAME_KEY] || "";
    res.json({ configured: !!(url || icsName), url: req.user.role === "admin" ? url : undefined, icsName: req.user.role === "admin" ? icsName : undefined });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load Google Calendar setting" });
  }
});
app.put("/api/settings/google-calendar", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  const url = String((req.body && req.body.url) || "").trim().slice(0, 2000);
  if (url && !isGoogleIcalUrl(url)) return res.status(400).json({ error: "Must be a https://calendar.google.com/ iCal address" });
  try {
    if (url) await loadGoogleEvents(url); // fail now, not later, if the address doesn't actually work
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [GOOGLE_ICAL_KEY, url]
    );
    icalCache = { url: "", at: 0, events: [] };
    const ics = await pool.query("SELECT 1 FROM app_settings WHERE key = $1 AND value <> ''", [ICS_NAME_KEY]);
    res.json({ configured: !!(url || ics.rows.length), url });
  } catch (err) {
    console.error("[gcal] save failed:", err.message);
    res.status(400).json({ error: "Could not read that calendar feed" });
  }
});

// A hand-uploaded .ics file (Google Calendar's "Export" download, Outlook, etc.)
// — a one-time snapshot, unlike the live iCal feed above. Stored as raw text in
// app_settings (validated by parsing it first) so every user sees it; admin-only
// like the feed, since it replaces what the whole workspace sees.
const ICS_TEXT_KEY = "ics_file_text";
const ICS_NAME_KEY = "ics_file_name";
let icsCache = { text: null, events: [] };
async function loadIcsFileEvents() {
  const r = await pool.query("SELECT value FROM app_settings WHERE key = $1", [ICS_TEXT_KEY]);
  const text = r.rows.length ? r.rows[0].value : "";
  if (!text) return [];
  if (icsCache.text !== text) icsCache = { text, events: parseIcs(text) };
  return icsCache.events;
}

app.put("/api/settings/ics-file", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  const text = String((req.body && req.body.text) || "");
  const name = String((req.body && req.body.name) || "calendar.ics").slice(0, 200);
  if (!/BEGIN:VCALENDAR/i.test(text)) return res.status(400).json({ error: "Not an .ics calendar file" });
  const count = parseIcs(text).length;
  if (!count) return res.status(400).json({ error: "No events found in that file" });
  try {
    for (const [key, value] of [[ICS_TEXT_KEY, text], [ICS_NAME_KEY, name]]) {
      await pool.query(`INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
    }
    res.json({ configured: true, icsName: name, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save the calendar file" });
  }
});
app.delete("/api/settings/ics-file", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  try {
    await pool.query("DELETE FROM app_settings WHERE key = ANY($1)", [[ICS_TEXT_KEY, ICS_NAME_KEY]]);
    const g = await pool.query("SELECT 1 FROM app_settings WHERE key = $1 AND value <> ''", [GOOGLE_ICAL_KEY]);
    res.json({ configured: g.rows.length > 0, icsName: "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove the calendar file" });
  }
});

app.get("/api/calendar-google", requireAuth, async (req, res) => {
  const from = String(req.query.from || ""), to = String(req.query.to || "");
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(from) || !isDate(to) || (new Date(to) - new Date(from)) / 86400000 > 62) {
    return res.status(400).json({ error: "from and to (YYYY-MM-DD, max 62 days) are required" });
  }
  try {
    const r = await pool.query("SELECT value FROM app_settings WHERE key = $1", [GOOGLE_ICAL_KEY]);
    const url = r.rows.length ? r.rows[0].value : "";
    const all = await loadIcsFileEvents();
    let feedFailed = false;
    let feed = [];
    if (url) { try { feed = await loadGoogleEvents(url); } catch (e) { feedFailed = true; console.error("[gcal] feed failed:", e.message); } }
    // a broken live feed shouldn't hide an uploaded file's events; only fail if that's all there is
    if (feedFailed && !all.length) return res.status(502).json({ error: "Could not load Google Calendar" });
    res.json(expandEvents(feed.concat(all), from, to));
  } catch (err) {
    console.error("[gcal] load failed:", err.message);
    res.status(502).json({ error: "Could not load Google Calendar" });
  }
});

// The external calendar (Google Calendar / Outlook / etc.) URL calendar.html
// embeds in its second tab — one workspace-wide value in app_settings, set by
// an admin, readable by everyone signed in. Only http(s) URLs are accepted
// since it ends up as an <iframe src>.
app.get("/api/settings/calendar-embed", requireAuth, async (req, res) => {
  try {
    const r = await pool.query("SELECT value FROM app_settings WHERE key = 'calendar_embed_url'");
    res.json({ url: r.rows.length ? r.rows[0].value : "" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load calendar setting" });
  }
});
app.put("/api/settings/calendar-embed", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  const url = String((req.body && req.body.url) || "").trim().slice(0, 2000);
  if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: "URL must start with http:// or https://" });
  try {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('calendar_embed_url', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [url]
    );
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save calendar setting" });
  }
});

// Optionally accepts { groups, tasks } (the same shape as a saved board
// state) to seed the project atomically from an imported Excel/MSP-XML file
// — everything happens in one transaction, so a failure partway through
// never leaves a project sitting around with the default "To-Do" group but
// none of the imported data (the two-request create-then-PUT sequence this
// replaced could do exactly that if the second request failed for any
// reason: session expiry, network drop, a bad row in the import).
// Optional intake-form fields (Section 1/3 of the "New project" form) — all
// optional here too, same reasoning as their ADD COLUMN IF NOT EXISTS in
// schema.sql: the client enforces which ones are actually required (*).
function projectDetailFields(body) {
  body = body || {};
  return {
    projectCode: (body.projectCode || "").trim() || null,
    shortName: (body.shortName || "").trim() || null,
    fiscalYear: (body.fiscalYear || "").trim() || null,
    projectType: (body.projectType || "").trim() || null,
    projectValue: body.projectValue === "" || body.projectValue == null ? null : Number(body.projectValue),
    systemFunction: (body.systemFunction || "").trim() || null,
    keyComponents: (body.keyComponents || "").trim() || null,
    organizationId: body.organizationId || null,
    ownerId: body.ownerId || null,
  };
}

app.post("/api/projects", requireAuth, requireEditor, async (req, res) => {
  const title = (req.body && req.body.title) || "New project";
  const importedGroups = Array.isArray(req.body && req.body.groups) ? req.body.groups : null;
  const importedTasks = Array.isArray(req.body && req.body.tasks) ? req.body.tasks : [];
  const d = projectDetailFields(req.body);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      `INSERT INTO projects (title, created_by, project_code, short_name, fiscal_year, project_type, project_value, system_function, key_components, organization_id, owner_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id, title, created_at, updated_at`,
      [title, req.user.id, d.projectCode, d.shortName, d.fiscalYear, d.projectType, d.projectValue, d.systemFunction, d.keyComponents, d.organizationId, d.ownerId]
    );
    const project = created.rows[0];

    if (importedGroups && importedGroups.length) {
      await insertGroupsAndTasks(client, project.id, importedGroups, importedTasks);
    } else {
      await client.query(
        "INSERT INTO groups (id, project_id, name, color, collapsed, sort_order) VALUES ($1, $2, $3, $4, $5, $6)",
        [Math.random().toString(36).slice(2, 10), project.id, "To-Do", "#c47f00", false, 0]
      );
    }

    // Project access is invite-only (see requireProjectAccess) — this is
    // what puts the creator on that list from the start, so they're never
    // locked out of their own project.
    await client.query(
      "INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [project.id, req.user.id]
    );
    await client.query("COMMIT");
    res.status(201).json({
      id: project.id,
      title: project.title,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      creatorName: req.user.name,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Failed to create project" });
  } finally {
    client.release();
  }
});

// Only an admin or the project's own creator may delete it — deliberately
// tighter than requireProjectAccess (which lets in every invited member),
// since this is irreversible and cascades to every group/task/subitem/
// update/notification the project owns (see the ON DELETE CASCADE chain in
// schema.sql).
app.delete("/api/projects/:id", requireAuth, async (req, res) => {
  try {
    const project = await pool.query("SELECT created_by FROM projects WHERE id = $1", [req.params.id]);
    if (!project.rows.length) return res.status(404).json({ error: "Project not found" });
    const isCreator = project.rows[0].created_by === req.user.id;
    if (req.user.role !== "admin" && !isCreator) {
      return res.status(403).json({ error: "Only an admin or this project's creator can delete it" });
    }
    await pool.query("DELETE FROM projects WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

app.get("/api/projects/:id/state", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const state = await loadProjectState(req.params.id);
    if (!state) return res.status(404).json({ error: "Project not found" });
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load project state" });
  }
});

app.put("/api/projects/:id/state", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  const state = req.body;
  if (!state || !Array.isArray(state.groups) || !Array.isArray(state.tasks)) {
    return res.status(400).json({ error: "Invalid state payload" });
  }
  try {
    await saveProjectState(req.params.id, state);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save project state" });
  }
});

// Project-level "Invite" list — a picked subset of workspace members (see
// the users table) who show up on this specific board's Invite panel.
app.get("/api/projects/:id/members", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.* FROM project_members pm
       JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1
       ORDER BY pm.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map(toUserJson));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list project members" });
  }
});

app.post("/api/projects/:id/members", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  const userId = req.body && req.body.userId;
  if (!userId) return res.status(400).json({ error: "userId is required" });
  try {
    const inserted = await pool.query(
      "INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING project_id",
      [req.params.id, userId]
    );
    res.status(201).json({ ok: true });

    // Only a genuinely new membership triggers the email — re-inviting an
    // existing member (ON CONFLICT DO NOTHING, no row returned) shouldn't
    // re-send it. Fire-and-forget after responding so a slow/broken SMTP
    // server never delays the invite itself.
    if (inserted.rows.length) {
      Promise.all([
        pool.query("SELECT title FROM projects WHERE id = $1", [req.params.id]),
        pool.query("SELECT name, email FROM users WHERE id = $1", [userId]),
      ]).then(([projectRes, userRes]) => {
        const project = projectRes.rows[0];
        const invitee = userRes.rows[0];
        if (!project || !invitee || !invitee.email) return;
        sendProjectInviteEmail({
          to: invitee.email,
          recipientName: invitee.name,
          projectTitle: project.title,
          projectId: req.params.id,
          inviterName: req.user.name,
        });
      }).catch((err) => console.error("[mailer] Failed to look up invite email details:", err.message));
    }
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Project or user not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to add project member" });
  }
});

app.delete("/api/projects/:id/members/:userId", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  try {
    await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [req.params.id, req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove project member" });
  }
});

// ---------------- project details (New project intake form) ----------------
// Section 1 (ข้อมูลโครงการ) + Section 3 (ข้อมูลลูกค้า) of the "New project"
// form: the scalar detail fields on `projects` itself, the two lookup
// pickers (organizations / project_owners), and Section 3's three
// project-scoped sub-lists (contacts, product registrations, site
// locations). Kept separate from the board-state routes above — this is
// project *metadata*, not the groups/tasks/subitems board tree.

app.get("/api/organizations", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name FROM organizations ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list organizations" });
  }
});

// Upsert-by-name: picking "+ create new" in the form re-posts the typed
// name, and a second project reusing the same organization name should
// reuse the same row rather than erroring or duplicating it.
app.post("/api/organizations", requireAuth, requireEditor, async (req, res) => {
  const name = (req.body && req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const result = await pool.query(
      `INSERT INTO organizations (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create organization" });
  }
});

app.get("/api/project-owners", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name FROM project_owners ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list project owners" });
  }
});

app.post("/api/project-owners", requireAuth, requireEditor, async (req, res) => {
  const name = (req.body && req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  try {
    const result = await pool.query(
      `INSERT INTO project_owners (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create project owner" });
  }
});

function toProjectDetailJson(row) {
  return {
    id: row.id,
    title: row.title,
    projectCode: row.project_code || "",
    shortName: row.short_name || "",
    fiscalYear: row.fiscal_year || "",
    projectType: row.project_type || "",
    projectValue: row.project_value,
    systemFunction: row.system_function || "",
    keyComponents: row.key_components || "",
    organizationId: row.organization_id,
    organizationName: row.organization_name || "",
    ownerId: row.owner_id,
    ownerName: row.owner_name || "",
  };
}

app.get("/api/projects/:id/details", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const project = await pool.query(
      `SELECT p.*, o.name AS organization_name, po.name AS owner_name
       FROM projects p
       LEFT JOIN organizations o ON o.id = p.organization_id
       LEFT JOIN project_owners po ON po.id = p.owner_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!project.rows.length) return res.status(404).json({ error: "Project not found" });

    const [contacts, registrations, sites] = await Promise.all([
      pool.query("SELECT id, name, email FROM project_contacts WHERE project_id = $1 ORDER BY sort_order ASC", [req.params.id]),
      pool.query("SELECT id, name FROM project_product_registrations WHERE project_id = $1 ORDER BY sort_order ASC", [req.params.id]),
      pool.query("SELECT id, location FROM project_sites WHERE project_id = $1 ORDER BY sort_order ASC", [req.params.id]),
    ]);

    res.json({
      ...toProjectDetailJson(project.rows[0]),
      contacts: contacts.rows,
      productRegistrations: registrations.rows,
      sites: sites.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load project details" });
  }
});

app.put("/api/projects/:id/details", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  const title = (req.body && req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "Project name is required" });
  const d = projectDetailFields(req.body);
  try {
    const updated = await pool.query(
      `UPDATE projects SET title = $1, project_code = $2, short_name = $3, fiscal_year = $4, project_type = $5,
              project_value = $6, system_function = $7, key_components = $8, organization_id = $9, owner_id = $10,
              updated_at = now()
       WHERE id = $11
       RETURNING *`,
      [title, d.projectCode, d.shortName, d.fiscalYear, d.projectType, d.projectValue, d.systemFunction, d.keyComponents, d.organizationId, d.ownerId, req.params.id]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "Project not found" });
    res.json(toProjectDetailJson(updated.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save project details" });
  }
});

// Section 3's three sub-lists (contacts / product registrations / sites)
// share the same small shape — list, add-one, delete-one — so they're
// generated from one helper rather than repeating the same five routes
// three times with only the table/column names different.
function registerProjectSubList(path, table, column, opts) {
  const withEmail = !!(opts && opts.withEmail);
  app.post(`/api/projects/:id/${path}`, requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
    const value = (req.body && req.body[column] || "").trim();
    if (!value) return res.status(400).json({ error: `${column} is required` });
    try {
      const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE project_id = $1`, [req.params.id]);
      const sortOrder = countRes.rows[0].n;
      const cols = withEmail ? `(project_id, ${column}, email, sort_order)` : `(project_id, ${column}, sort_order)`;
      const vals = withEmail
        ? [req.params.id, value, (req.body.email || "").trim() || null, sortOrder]
        : [req.params.id, value, sortOrder];
      const placeholders = vals.map((_, i) => `$${i + 1}`).join(", ");
      const inserted = await pool.query(`INSERT INTO ${table} ${cols} VALUES (${placeholders}) RETURNING *`, vals);
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      if (err.code === "23503") return res.status(400).json({ error: "Project not found" });
      console.error(err);
      res.status(500).json({ error: `Failed to add ${path}` });
    }
  });

  app.delete(`/api/projects/:id/${path}/:rowId`, requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1 AND project_id = $2`, [req.params.rowId, req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: `Failed to remove ${path} entry` });
    }
  });
}
registerProjectSubList("contacts", "project_contacts", "name", { withEmail: true });
registerProjectSubList("product-registrations", "project_product_registrations", "name");
registerProjectSubList("sites", "project_sites", "location");

// "ส่ง Email แจ้งผู้เกี่ยวข้อง" — notifies every currently-invited project
// member who has an email on file that the project's details were saved/
// updated. Best-effort per recipient: one bad address doesn't stop the rest.
app.post("/api/projects/:id/notify-members", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const project = await pool.query("SELECT title FROM projects WHERE id = $1", [req.params.id]);
    if (!project.rows.length) return res.status(404).json({ error: "Project not found" });
    const members = await pool.query(
      `SELECT u.name, u.email FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = $1 AND u.email IS NOT NULL AND u.email <> ''`,
      [req.params.id]
    );
    const recipients = members.rows;
    for (const m of recipients) {
      sendProjectInviteEmail({
        to: m.email,
        recipientName: m.name,
        projectTitle: project.rows[0].title,
        projectId: req.params.id,
        inviterName: req.user.name,
      });
    }
    res.json({ ok: true, notified: recipients.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send notification emails" });
  }
});

// ---------------- delivery orders ("ใบส่งสินค้า", form FM-PM-01) ----------------
// Printable equipment hand-over record, scoped to a project. Line items
// travel as a plain array on the record (see schema.sql's comment on
// delivery_orders.items) rather than their own table/routes.

// Which item-table columns a delivery order shows, chosen in the editor's
// column picker — validated against this list (plus whatever custom
// columns the same request defines) so a client can't smuggle an
// arbitrary key in, and defaulted to the original FM-PM-01 layout's own
// columns when a client sends nothing (or an old record predates the
// column picker and has none stored).
const ALLOWED_DELIVERY_COLUMNS = ["type", "item", "shortName", "brand", "model", "serial", "qty", "remark", "location", "note", "receivedDate", "warrantyStart", "warrantyEnd"];
const DEFAULT_DELIVERY_COLUMNS = ["type", "item", "shortName", "brand", "model", "serial", "location", "qty", "receivedDate", "warrantyStart", "warrantyEnd", "remark", "note"];
const CUSTOM_COLUMN_KEY_RE = /^custom_[a-z0-9]{1,20}$/i;
const MAX_CUSTOM_COLUMNS = 10;

// A user-added column beyond the built-in set — [{key, label}]. The key
// must match what the client actually generates (custom_<random>); a
// request with a malformed or duplicate key just drops that entry rather
// than erroring the whole save.
function sanitizeDeliveryCustomColumns(customColumns) {
  if (!Array.isArray(customColumns)) return [];
  const seen = new Set();
  const out = [];
  for (const c of customColumns) {
    const key = String((c && c.key) || "");
    const label = String((c && c.label) || "").slice(0, 60).trim();
    if (!CUSTOM_COLUMN_KEY_RE.test(key) || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
    if (out.length >= MAX_CUSTOM_COLUMNS) break;
  }
  return out;
}

function sanitizeDeliveryItems(items, customKeys) {
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      const row = {
        type: String((it && it.type) || "").slice(0, 200).trim(),
        item: String((it && it.item) || "").slice(0, 500).trim(),
        shortName: String((it && it.shortName) || "").slice(0, 200).trim(),
        brand: String((it && it.brand) || "").slice(0, 200).trim(),
        model: String((it && it.model) || "").slice(0, 200).trim(),
        serial: String((it && it.serial) || "").slice(0, 200).trim(),
        qty: String((it && it.qty) || "").slice(0, 50).trim(),
        remark: String((it && it.remark) || "").slice(0, 500).trim(),
        location: String((it && it.location) || "").slice(0, 200).trim(),
        note: String((it && it.note) || "").slice(0, 500).trim(),
        receivedDate: String((it && it.receivedDate) || "").slice(0, 10).trim(),
        warrantyStart: String((it && it.warrantyStart) || "").slice(0, 10).trim(),
        warrantyEnd: String((it && it.warrantyEnd) || "").slice(0, 10).trim(),
      };
      for (const key of customKeys || []) row[key] = String((it && it[key]) || "").slice(0, 300).trim();
      return row;
    })
    .filter((it) => Object.values(it).some(Boolean));
}

function sanitizeDeliveryColumns(columns, customKeys) {
  const allowed = ALLOWED_DELIVERY_COLUMNS.concat(customKeys || []);
  if (!Array.isArray(columns)) return DEFAULT_DELIVERY_COLUMNS;
  const filtered = columns.filter((c) => allowed.includes(c));
  return filtered.length ? filtered : DEFAULT_DELIVERY_COLUMNS;
}

function toDeliveryOrderJson(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    docNo: row.doc_no || "",
    contractNo: row.contract_no || "",
    department: row.department || "",
    items: row.items || [],
    columns: row.columns || DEFAULT_DELIVERY_COLUMNS,
    customColumns: row.custom_columns || [],
    notes: row.notes || "",
    senderName: row.sender_name || "",
    senderPhone: row.sender_phone || "",
    sentDate: row.sent_date,
    receiverName: row.receiver_name || "",
    receiverPhone: row.receiver_phone || "",
    receivedDate: row.received_date,
    createdByName: row.created_by_name || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/projects/:id/delivery-orders", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS created_by_name FROM delivery_orders d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.project_id = $1 ORDER BY d.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows.map(toDeliveryOrderJson));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load delivery orders" });
  }
});

app.get("/api/projects/:id/delivery-orders/:orderId", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT d.*, u.name AS created_by_name FROM delivery_orders d
       LEFT JOIN users u ON u.id = d.created_by
       WHERE d.id = $1 AND d.project_id = $2`,
      [req.params.orderId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Delivery order not found" });
    res.json(toDeliveryOrderJson(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load delivery order" });
  }
});

app.post("/api/projects/:id/delivery-orders", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  const b = req.body || {};
  const customColumns = sanitizeDeliveryCustomColumns(b.customColumns);
  const customKeys = customColumns.map((c) => c.key);
  try {
    const inserted = await pool.query(
      `INSERT INTO delivery_orders
         (project_id, doc_no, contract_no, department, items, columns, custom_columns, notes,
          sender_name, sender_phone, sent_date, receiver_name, receiver_phone, received_date, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        req.params.id,
        (b.docNo || "").trim(),
        (b.contractNo || "").trim(),
        (b.department || "").trim(),
        JSON.stringify(sanitizeDeliveryItems(b.items, customKeys)),
        JSON.stringify(sanitizeDeliveryColumns(b.columns, customKeys)),
        JSON.stringify(customColumns),
        (b.notes || "").trim(),
        (b.senderName || "").trim(),
        (b.senderPhone || "").trim(),
        b.sentDate || null,
        (b.receiverName || "").trim(),
        (b.receiverPhone || "").trim(),
        b.receivedDate || null,
        req.user.id,
      ]
    );
    res.status(201).json(toDeliveryOrderJson({ ...inserted.rows[0], created_by_name: req.user.name }));
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "Project not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to create delivery order" });
  }
});

app.put("/api/projects/:id/delivery-orders/:orderId", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  const b = req.body || {};
  const customColumns = sanitizeDeliveryCustomColumns(b.customColumns);
  const customKeys = customColumns.map((c) => c.key);
  try {
    const updated = await pool.query(
      `UPDATE delivery_orders SET
         doc_no = $1, contract_no = $2, department = $3, items = $4, columns = $5, custom_columns = $6, notes = $7,
         sender_name = $8, sender_phone = $9, sent_date = $10,
         receiver_name = $11, receiver_phone = $12, received_date = $13, updated_at = now()
       WHERE id = $14 AND project_id = $15
       RETURNING *`,
      [
        (b.docNo || "").trim(),
        (b.contractNo || "").trim(),
        (b.department || "").trim(),
        JSON.stringify(sanitizeDeliveryItems(b.items, customKeys)),
        JSON.stringify(sanitizeDeliveryColumns(b.columns, customKeys)),
        JSON.stringify(customColumns),
        (b.notes || "").trim(),
        (b.senderName || "").trim(),
        (b.senderPhone || "").trim(),
        b.sentDate || null,
        (b.receiverName || "").trim(),
        (b.receiverPhone || "").trim(),
        b.receivedDate || null,
        req.params.orderId,
        req.params.id,
      ]
    );
    if (!updated.rows.length) return res.status(404).json({ error: "Delivery order not found" });
    const creator = await pool.query("SELECT name FROM users WHERE id = (SELECT created_by FROM delivery_orders WHERE id = $1)", [req.params.orderId]);
    res.json(toDeliveryOrderJson({ ...updated.rows[0], created_by_name: creator.rows[0] && creator.rows[0].name }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save delivery order" });
  }
});

app.delete("/api/projects/:id/delivery-orders/:orderId", requireAuth, requireEditor, requireProjectAccess, async (req, res) => {
  try {
    await pool.query("DELETE FROM delivery_orders WHERE id = $1 AND project_id = $2", [req.params.orderId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete delivery order" });
  }
});

// ---------------- legacy single-project routes (default project) ----------------

app.get("/api/state", requireAuth, async (req, res) => {
  try {
    const projectId = await getOrCreateDefaultProjectId();
    const state = await loadProjectState(projectId);
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load state" });
  }
});

app.put("/api/state", requireAuth, requireEditor, async (req, res) => {
  const state = req.body;
  if (!state || !Array.isArray(state.groups) || !Array.isArray(state.tasks)) {
    return res.status(400).json({ error: "Invalid state payload" });
  }
  try {
    const projectId = await getOrCreateDefaultProjectId();
    await saveProjectState(projectId, state);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save state" });
  }
});

// ---------------- user management ----------------

const VALID_ROLES = ["admin", "member", "viewer"];

function toUserJson(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email || "",
    role: row.role || "member",
    department: row.department || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users ORDER BY created_at ASC");
    res.json(result.rows.map(toUserJson));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

// requireAuthUnlessBootstrap: the very first user (empty workspace) can be
// created with no session yet, so there's a way to log in at all — req.user
// is never set on that path, so the admin check right below only ever
// applies once someone actually exists to be an admin (or not) in the
// first place. Every other case (member/viewer creating a user, including
// trying to hand themselves "admin") is rejected here — Manage Users
// (GET is fine for any signed-in user, since board.html/workspace.html's
// Invite pickers need the workspace roster) is otherwise an admin-only page.
app.post("/api/users", requireAuthUnlessBootstrap, async (req, res) => {
  if (req.user && req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  const name = (req.body && req.body.name || "").trim();
  const email = (req.body && req.body.email || "").trim();
  const role = VALID_ROLES.includes(req.body && req.body.role) ? req.body.role : "member";
  // Password is optional here: an admin can set one directly, or leave it
  // blank and let the new person claim their own via the login page's
  // "First time here?" flow (same as how Manage users worked before logins
  // existed at all).
  const password = (req.body && req.body.password) || "";
  const department = (req.body && req.body.department || "").trim();
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (password && password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const created = await pool.query(
      "INSERT INTO users (name, email, role, password_hash, department) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, email || null, role, hash, department || null]
    );
    res.status(201).json(toUserJson(created.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.put("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const name = (req.body && req.body.name || "").trim();
  const email = (req.body && req.body.email || "").trim();
  const role = VALID_ROLES.includes(req.body && req.body.role) ? req.body.role : "member";
  const password = (req.body && req.body.password) || ""; // optional — blank leaves the password unchanged
  // Optional — omitted entirely (existing callers that don't know about this
  // field yet) leaves the current department alone rather than clearing it;
  // an explicit "" from the department UI does clear it back to unassigned.
  const departmentProvided = req.body && Object.prototype.hasOwnProperty.call(req.body, "department");
  const department = departmentProvided ? (req.body.department || "").trim() : undefined;
  if (!name) return res.status(400).json({ error: "Name is required" });
  if (password && password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
  try {
    const updated = password
      ? await pool.query(
          "UPDATE users SET name = $1, email = $2, role = $3, password_hash = $4, department = CASE WHEN $5 THEN $6 ELSE department END, updated_at = now() WHERE id = $7 RETURNING *",
          [name, email || null, role, await bcrypt.hash(password, 10), departmentProvided, department || null, req.params.id]
        )
      : await pool.query(
          "UPDATE users SET name = $1, email = $2, role = $3, department = CASE WHEN $4 THEN $5 ELSE department END, updated_at = now() WHERE id = $6 RETURNING *",
          [name, email || null, role, departmentProvided, department || null, req.params.id]
        );
    if (!updated.rows.length) return res.status(404).json({ error: "User not found" });
    res.json(toUserJson(updated.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const deleted = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [req.params.id]);
    if (!deleted.rows.length) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// ---------------- notifications (@mentions) ----------------
// A tag in a task update ("@Name") creates a row here for that person, so
// it shows up on their own account (sidebar bell) — not just left sitting
// in a task's update thread they may never open.

app.get("/api/notifications", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.message, n.project_id, n.task_id, n.read, n.created_at, u.name AS from_name
       FROM notifications n
       LEFT JOIN users u ON u.id = n.from_user_id
       WHERE n.to_user_id = $1
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [req.user.id]
    );
    res.json(
      result.rows.map((n) => ({
        id: n.id,
        message: n.message,
        projectId: n.project_id,
        taskId: n.task_id,
        fromName: n.from_name || "",
        read: n.read,
        createdAt: n.created_at,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load notifications" });
  }
});

app.post("/api/notifications", requireAuth, async (req, res) => {
  const toUserId = req.body && req.body.toUserId;
  const message = req.body && req.body.message;
  if (!toUserId || !message) return res.status(400).json({ error: "toUserId and message are required" });
  try {
    const result = await pool.query(
      `INSERT INTO notifications (to_user_id, from_user_id, project_id, task_id, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [toUserId, req.user.id, req.body.projectId || null, req.body.taskId || null, message]
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === "23503") return res.status(400).json({ error: "User not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

app.post("/api/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET read = true WHERE id = $1 AND to_user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update notification" });
  }
});

app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE notifications SET read = true WHERE to_user_id = $1 AND read = false", [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update notifications" });
  }
});

// ---------------- reminders (stale tasks / approaching deadlines) ----------------
// The actual check runs on a 24h timer (see scheduleDailyReminders below,
// called at the bottom of this file) — this route exists so an admin can
// fire it on demand (testing, or "I don't want to wait until tomorrow
// morning") without waiting for the timer.
app.post("/api/reminders/run", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  try {
    const result = await runReminderCheck(pool);
    res.json(result);
  } catch (err) {
    console.error("[reminders] manual run failed:", err);
    res.status(500).json({ error: "Failed to run reminder check" });
  }
});

// The on/off switch + the two day thresholds behind it — read by workspace.html's
// reminder settings modal (admin-only, both directions: nothing here is
// useful to a non-admin, so GET is gated the same as PUT rather than left open).
app.get("/api/settings/reminders", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  try {
    res.json(await getReminderSettings(pool));
  } catch (err) {
    console.error("[reminders] failed to load settings:", err);
    res.status(500).json({ error: "Failed to load reminder settings" });
  }
});
app.put("/api/settings/reminders", requireAuth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Admins only" });
  try {
    res.json(await updateReminderSettings(pool, req.body || {}));
  } catch (err) {
    console.error("[reminders] failed to save settings:", err);
    res.status(500).json({ error: "Failed to save reminder settings" });
  }
});

// ---------------- file uploads (task update attachments) ----------------
// Files are named with a random token, not the original filename, so the
// URL itself is the access control (same tradeoff plain <a href> downloads
// already require — no Authorization header on a browser navigation/click,
// so this can't sit behind the Bearer-token requireAuth like the JSON API).

const uploadsDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const token = crypto.randomBytes(16).toString("hex");
      const ext = path.extname(file.originalname).slice(0, 20).replace(/[^a-zA-Z0-9.]/g, "");
      cb(null, token + ext);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

app.post("/api/uploads", requireAuth, requireEditor, (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File is larger than 15MB" : "Upload failed";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.status(201).json({
      url: "/uploads/" + req.file.filename,
      name: req.file.originalname,
      size: req.file.size,
      mime: req.file.mimetype,
    });
  });
});

app.use("/uploads", express.static(uploadsDir));

// ---------------- .mpp import (Microsoft Project native file) ----------------
// The browser has no way to parse .mpp — it's a proprietary binary format —
// so this shells out to MPXJ (a Java library; see server/mpxj/) to convert
// the upload to MSPDI XML, which is exactly the format
// shared/project-import.js's MS Project XML import already parses. The
// client-side import flow is therefore unchanged for every format except
// this one extra network hop; see PM.ProjectImport.parseFile's ".mpp"
// branch in project-import.js.

const mppTmpDir = path.join(os.tmpdir(), "pm-board-mpp-import");
fs.mkdirSync(mppTmpDir, { recursive: true });

const mppUpload = multer({
  storage: multer.diskStorage({
    destination: mppTmpDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString("hex") + ".mpp"),
  }),
  limits: { fileSize: 30 * 1024 * 1024 }, // MS Project files can run larger than a typical chat attachment
});

// Built by server/mpxj/build.sh — gitignored (see the comment in
// server/mpxj/pom.xml for why it's rebuilt locally rather than committed).
const MPXJ_JAR = path.join(__dirname, "mpxj", "target", "mpxj-convert-1.0.jar");

app.post("/api/import/mpp", requireAuth, requireEditor, (req, res) => {
  mppUpload.single("file")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "File is larger than 30MB" : "Upload failed";
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const inPath = req.file.path;
    const cleanupIn = () => fs.unlink(inPath, () => {});

    if (!fs.existsSync(MPXJ_JAR)) {
      cleanupIn();
      return res.status(501).json({ error: "MPP import isn't set up on this server yet — run server/mpxj/build.sh (needs Java + Maven), then retry" });
    }

    const outPath = inPath + ".xml";
    execFile(
      "java",
      ["-cp", MPXJ_JAR, "org.mpxj.sample.MpxjConvert", inPath, outPath],
      { timeout: 30000 },
      (convErr) => {
        cleanupIn();
        if (convErr) {
          fs.unlink(outPath, () => {});
          console.error("[mpp-import] MPXJ conversion failed:", convErr.message);
          return res.status(400).json({ error: "Could not read this .mpp file — it may be corrupt, password-protected, or an unsupported MS Project version" });
        }
        fs.readFile(outPath, "utf8", (readErr, xml) => {
          fs.unlink(outPath, () => {});
          if (readErr) {
            console.error("[mpp-import] Failed to read converted XML:", readErr.message);
            return res.status(500).json({ error: "Conversion succeeded but the result couldn't be read" });
          }
          res.json({ xml });
        });
      }
    );
  });
});

// Runs runReminderCheck once a day at 08:00 server time, forever, for as
// long as this process stays up — no separate cron/scheduler needed. Only
// scheduled here (not run immediately on boot) so a `pm2 restart` doesn't
// itself trigger a fresh batch of reminder emails.
function scheduleDailyReminders() {
  function msUntilNext8am() {
    const next = new Date();
    next.setHours(8, 0, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    return next - new Date();
  }
  function runAndReschedule() {
    runReminderCheck(pool)
      .then((r) => console.log(`[reminders] daily check: notified ${r.notified}, skipped ${r.skipped}`))
      .catch((err) => console.error("[reminders] daily check failed:", err));
    setTimeout(runAndReschedule, 24 * 60 * 60 * 1000);
  }
  setTimeout(runAndReschedule, msUntilNext8am());
}
scheduleDailyReminders();

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => {
  console.log(`PM board API listening on http://localhost:${PORT}`);
});
