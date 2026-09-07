// Daily reminder job: notifies a task/subitem's owner (in-app + email) when
// either (a) it hasn't had a new update in STALE_DAYS days, or (b) its due
// date is within DEADLINE_WARN_DAYS days — including already overdue, since
// "due_date <= today + DEADLINE_WARN_DAYS" covers that as a subset. Wired up
// from server.js on a 24h timer; also reachable on demand via
// POST /api/reminders/run (admin-only) for testing without waiting a day.
//
// `owner` on tasks/subitems is free-text (see schema.sql), not a users(id)
// FK, so a reminder can only be delivered when that text matches a real
// account's name (case/whitespace-insensitive) — an owner name that doesn't
// match anyone just gets silently skipped rather than guessed at.
const { sendReminderEmail } = require("./mailer");

const STALE_DAYS = 7;
const DEADLINE_WARN_DAYS = 3;
// How long to hold off re-sending the *same* reminder (same to_user_id +
// type) once it's already gone out today — comfortably under 24h so a job
// that's a little early/late from one day to the next still only fires once.
const DEDUPE_HOURS = 20;

function daysAgo(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}
// due_date/date columns come back as raw "YYYY-MM-DD" strings (see db.js);
// compare at UTC midnight so this isn't sensitive to the server's own TZ.
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr + "T00:00:00Z");
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  return Math.round((due - today) / 86400000);
}

async function fetchCandidates(pool) {
  const taskRows = await pool.query(`
    SELECT t.id AS task_id, NULL::text AS subitem_id, t.name, t.owner, t.due_date,
           p.id AS project_id, p.title AS project_title, t.name AS task_name,
           (SELECT MAX(u.time) FROM updates u WHERE u.task_id = t.id AND u.subitem_id IS NULL) AS last_update
    FROM tasks t
    JOIN groups g ON g.id = t.group_id
    JOIN projects p ON p.id = g.project_id
    WHERE t.status IS DISTINCT FROM 'done'
  `);
  const subRows = await pool.query(`
    SELECT s.id AS subitem_id, s.task_id, s.name, s.owner, s.date AS due_date,
           p.id AS project_id, p.title AS project_title, t.name AS task_name,
           (SELECT MAX(u.time) FROM updates u WHERE u.subitem_id = s.id) AS last_update
    FROM subitems s
    JOIN tasks t ON t.id = s.task_id
    JOIN groups g ON g.id = t.group_id
    JOIN projects p ON p.id = g.project_id
    WHERE s.status IS DISTINCT FROM 'done'
  `);
  return taskRows.rows.concat(subRows.rows);
}

function buildMessage(kind, row) {
  const where = row.subitem_id ? `งานย่อย "${row.name}" (ใน "${row.task_name}")` : `งาน "${row.name}"`;
  const project = ` ในโปรเจกต์ "${row.project_title}"`;
  if (kind === "stale") {
    return `${where}${project} ยังไม่มีความคืบหน้าใหม่มา ${daysAgo(row.last_update)} วันแล้ว`;
  }
  const until = daysUntil(row.due_date);
  if (until < 0) return `${where}${project} เลยกำหนดส่งมาแล้ว ${-until} วัน (กำหนดเดิม ${row.due_date})`;
  if (until === 0) return `${where}${project} ครบกำหนดวันนี้ (${row.due_date})`;
  return `${where}${project} ใกล้ครบกำหนดในอีก ${until} วัน (${row.due_date})`;
}

// Runs the check once and returns {notified, skipped} for the caller
// (server.js logs it; the manual-trigger endpoint returns it to the admin).
async function runReminderCheck(pool) {
  const usersResult = await pool.query("SELECT id, name, email FROM users WHERE name IS NOT NULL");
  const userByName = new Map();
  usersResult.rows.forEach((u) => {
    if (u.name) userByName.set(u.name.trim().toLowerCase(), u);
  });

  const candidates = await fetchCandidates(pool);
  let notified = 0;
  let skipped = 0;

  for (const row of candidates) {
    const kinds = [];
    // Never-updated items are skipped here on purpose — tasks/subitems have
    // no created_at, so there's no way to tell a brand-new item from one
    // that's genuinely gone quiet; only flag staleness once there's at
    // least one real update to measure the gap from.
    if (row.last_update && daysAgo(row.last_update) >= STALE_DAYS) kinds.push("stale");
    if (row.due_date && daysUntil(row.due_date) <= DEADLINE_WARN_DAYS) kinds.push("deadline");
    if (!kinds.length) continue;

    const owner = row.owner && userByName.get(row.owner.trim().toLowerCase());
    if (!owner) { skipped += kinds.length; continue; }

    const itemId = row.subitem_id || row.task_id;
    for (const kind of kinds) {
      const type = `reminder:${kind}:${row.subitem_id ? "sub" : "task"}:${itemId}`;
      const already = await pool.query(
        `SELECT 1 FROM notifications WHERE to_user_id = $1 AND type = $2 AND created_at > now() - interval '${DEDUPE_HOURS} hours'`,
        [owner.id, type]
      );
      if (already.rows.length) { skipped++; continue; }

      const message = buildMessage(kind, row);
      await pool.query(
        `INSERT INTO notifications (to_user_id, from_user_id, project_id, task_id, message, type)
         VALUES ($1, NULL, $2, $3, $4, $5)`,
        [owner.id, row.project_id, row.task_id, message, type]
      );
      if (owner.email) {
        await sendReminderEmail({ to: owner.email, recipientName: owner.name, message, projectId: row.project_id, taskId: row.task_id })
          .catch((err) => console.error("[reminders] email failed for", owner.email, "-", err.message));
      }
      notified++;
    }
  }

  return { notified, skipped };
}

module.exports = { runReminderCheck };
