import pg from "pg";
import fs from "fs";
const { Pool } = pg;

const env = {};
try {
  const lines = fs.readFileSync("/root/fremio/backend/.env", "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"](.*)['"]$/,"$1");
  }
} catch (e) {}

const p = new Pool({
  host: env.DB_HOST || "localhost",
  port: Number(env.DB_PORT) || 5432,
  database: env.DB_NAME || "fremio",
  user: env.DB_USER || "fremio_user",
  password: env.DB_PASSWORD || ""
});

try {
  const r = await p.query('SELECT id, slots FROM frames WHERE is_active = true ORDER BY created_at DESC LIMIT 5');
  for (const row of r.rows) {
    const slots = typeof row.slots === 'string' ? JSON.parse(row.slots) : row.slots;
    const first = slots?.[0] || {};
    console.log(JSON.stringify({ id: row.id, hasSlotNumber: 'slotNumber' in first, hasPhotoIndex: 'photoIndex' in first, slotNumber: first.slotNumber, photoIndex: first.photoIndex }));
  }
} catch (e) { console.error(e.message); }
finally { await p.end(); }
