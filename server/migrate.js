require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db");

const seedState = require("./seed-data.json");

async function run() {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  await pool.query(schema);

  const existing = await pool.query("SELECT id FROM projects LIMIT 1");
  if (existing.rows.length) {
    console.log("Projects table already has data — skipping seed.");
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const projectRes = await client.query(
      "INSERT INTO projects (title, created_at, updated_at) VALUES ($1, $2, $3) RETURNING id",
      [seedState.title, seedState.createdAt, seedState.updatedAt]
    );
    const projectId = projectRes.rows[0].id;

    for (let gi = 0; gi < seedState.groups.length; gi++) {
      const g = seedState.groups[gi];
      await client.query(
        `INSERT INTO groups (id, project_id, name, color, collapsed, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [g.id, projectId, g.name, g.color || null, !!g.collapsed, gi]
      );
    }

    for (let ti = 0; ti < seedState.tasks.length; ti++) {
      const t = seedState.tasks[ti];
      await client.query(
        `INSERT INTO tasks (id, group_id, name, owner, status, priority, start_date, due_date, subitems_open, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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
        ]
      );

      const subitems = Array.isArray(t.subitems) ? t.subitems : [];
      for (let si = 0; si < subitems.length; si++) {
        const s = subitems[si];
        await client.query(
          `INSERT INTO subitems (id, task_id, name, owner, status, date, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [s.id, t.id, s.name, s.owner || null, s.status || null, s.date || null, si]
        );
      }

      const updates = Array.isArray(t.updates) ? t.updates : [];
      for (let ui = 0; ui < updates.length; ui++) {
        const u = updates[ui];
        await client.query(
          `INSERT INTO updates (id, task_id, author, time, text, likes, liked, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [u.id, t.id, u.author || null, u.time || null, u.text || null, u.likes || 0, !!u.liked, ui]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Seed data inserted.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
