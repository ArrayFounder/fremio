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
  const r = await p.query("select frame_data from designer_submissions where id = $1", ["2ce0696e-8710-4e6b-961f-6245cf0ec5eb"]);
  if (r.rows.length === 0) { console.log("NOT_FOUND"); }
  else {
    const fd = typeof r.rows[0].frame_data === "string" ? JSON.parse(r.rows[0].frame_data) : r.rows[0].frame_data;
    const s = fd.slots?.[0] || {};
    console.log(JSON.stringify({ slotNumber: s.slotNumber, photoIndex: s.photoIndex, totalSlots: fd.slots?.length || 0 }));
  }
} catch (e) { console.error(e.message); }
finally { await p.end(); }
