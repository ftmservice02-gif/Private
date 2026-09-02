require("dotenv").config();
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pool = require("./db");
const { sendProjectInviteEmail } = require("./mailer");

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

// Gates a project's state/members routes (req.params.id) to admins and
// invited members. A project with nobody in project_members yet is treated
// as open to every signed-in user — this is what makes turning on Invite
// opt-in per project rather than an instant lockout for every project that
// existed before this table did. Must run after requireAuth (needs req.user).
async function requireProjectAccess(req, res, next) {
  if (req.user.role === "admin") return next();
  const projectId = req.params.id;
  try {
    const memberRows = await pool.query("SELECT user_id FROM project_members WHERE project_id = $1", [projectId]);
    if (memberRows.rows.length === 0) return next(); // not curated yet — open to the team
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
    // Non-admins only see projects that are either open to the whole team
    // (no curated project_members yet) or ones they've been explicitly
    // added to — mirrors the check in requireProjectAccess.
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
          OR NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id)
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
              OR NOT EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id)
              OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2))`,
      [isAdmin, req.user.id]
    );
    res.json({ done: result.rows[0].done, total: result.rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// Optionally accepts { groups, tasks } (the same shape as a saved board
// state) to seed the project atomically from an imported Excel/MSP-XML file
// — everything happens in one transaction, so a failure partway through
// never leaves a project sitting around with the default "To-Do" group but
// none of the imported data (the two-request create-then-PUT sequence this
// replaced could do exactly that if the second request failed for any
// reason: session expiry, network drop, a bad row in the import).
app.post("/api/projects", requireAuth, async (req, res) => {
  const title = (req.body && req.body.title) || "New project";
  const importedGroups = Array.isArray(req.body && req.body.groups) ? req.body.groups : null;
  const importedTasks = Array.isArray(req.body && req.body.tasks) ? req.body.tasks : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = await client.query(
      "INSERT INTO projects (title, created_by) VALUES ($1, $2) RETURNING id, title, created_at, updated_at",
      [title, req.user.id]
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

    // Creator automatically retains access once the project gets curated
    // membership later (see requireProjectAccess / GET /api/projects filter).
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

app.put("/api/projects/:id/state", requireAuth, requireProjectAccess, async (req, res) => {
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

app.post("/api/projects/:id/members", requireAuth, requireProjectAccess, async (req, res) => {
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

app.delete("/api/projects/:id/members/:userId", requireAuth, requireProjectAccess, async (req, res) => {
  try {
    await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [req.params.id, req.params.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove project member" });
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

app.put("/api/state", requireAuth, async (req, res) => {
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
// created with no session yet, so there's a way to log in at all.
app.post("/api/users", requireAuthUnlessBootstrap, async (req, res) => {
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

app.put("/api/users/:id", requireAuth, async (req, res) => {
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

app.delete("/api/users/:id", requireAuth, async (req, res) => {
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

app.post("/api/uploads", requireAuth, (req, res) => {
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

const PORT = process.env.PORT || 8790;
app.listen(PORT, () => {
  console.log(`PM board API listening on http://localhost:${PORT}`);
});
