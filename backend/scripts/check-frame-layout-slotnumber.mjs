import pg from "pg";
import fs from "fs";
const { Pool } = pg;

const env = {};
try {
  const lines = fs.readFileSync("/root/fremio/backend/.env", "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^['"](.*)['"]$/, "$1");
  }
} catch (e) {}

const p = new Pool({
  host: env.DB_HOST || "localhost",
  port: Number(env.DB_PORT) || 5432,
  database: env.DB_NAME || "fremio",
  user: env.DB_USER || "fremio_user",
  password: env.DB_PASSWORD || "",
});

try {
  const r = await p.query("SELECT id, layout FROM frames WHERE is_active = true ORDER BY created_at DESC LIMIT 50");
  for (const row of r.rows) {
    const layout = typeof row.layout === "string" ? JSON.parse(row.layout) : row.layout;
    const photos = (layout?.elements || []).filter((el) => el?.type === "photo");
    if (photos.length > 0) {
      const d = photos[0]?.data || {};
      console.log(JSON.stringify({ id: row.id, photoEls: photos.length, slotNumber: d.slotNumber, photoIndex: d.photoIndex }));
      break;
    }
  }
} catch (e) {
  console.error(e.message);
} finally {
  await p.end();
}
