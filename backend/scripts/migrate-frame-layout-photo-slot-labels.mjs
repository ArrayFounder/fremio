import pg from "pg";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
} catch {}

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write") || args.includes("--apply");

const parseJSON = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
};

const pool = new pg.Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "fremio",
  user: process.env.DB_USER || "fremio_user",
  password: process.env.DB_PASSWORD || "",
  ssl:
    String(process.env.DB_SSL || process.env.DATABASE_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false,
});

async function run() {
  const client = await pool.connect();
  const counters = {
    total: 0,
    noSlots: 0,
    noLayoutElements: 0,
    noPhotoElements: 0,
    candidates: 0,
    updated: 0,
    failed: 0,
  };

  try {
    console.log("🔍 Scan frames.layout photo slot labels...");
    if (!shouldWrite) {
      console.log("⚠️ DRY RUN - no writes. Use --write to apply.\n");
    }

    const result = await client.query(
      "SELECT id, slots, layout FROM frames WHERE is_active = true ORDER BY created_at DESC"
    );
    counters.total = result.rows.length;

    for (const row of result.rows) {
      const slots = parseJSON(row.slots, []);
      const layout = parseJSON(row.layout, {});

      if (!Array.isArray(slots) || slots.length === 0) {
        counters.noSlots += 1;
        continue;
      }
      if (!Array.isArray(layout?.elements)) {
        counters.noLayoutElements += 1;
        continue;
      }

      const photoIndices = [];
      layout.elements.forEach((el, i) => {
        if (el?.type === "photo") photoIndices.push(i);
      });

      if (photoIndices.length === 0) {
        counters.noPhotoElements += 1;
        continue;
      }

      let changed = false;
      const nextElements = layout.elements.map((el, idx) => {
        const pos = photoIndices.indexOf(idx);
        if (el?.type !== "photo" || pos === -1) return el;

        const slot = slots[pos] || {};
        const nextSlotNumber = Number.isFinite(Number(slot.slotNumber)) ? Number(slot.slotNumber) : pos + 1;
        const nextPhotoIndex = Number.isFinite(Number(slot.photoIndex)) ? Number(slot.photoIndex) : pos;

        const currentSlotNumber = el?.data?.slotNumber;
        const currentPhotoIndex = el?.data?.photoIndex;

        const needSlotNumber = currentSlotNumber !== nextSlotNumber;
        const needPhotoIndex = currentPhotoIndex !== nextPhotoIndex;

        if (!needSlotNumber && !needPhotoIndex) return el;

        changed = true;
        return {
          ...el,
          data: {
            ...(el.data || {}),
            slotNumber: nextSlotNumber,
            photoIndex: nextPhotoIndex,
            label: el?.data?.label || "Foto",
            objectFit: el?.data?.objectFit || "cover",
          },
        };
      });

      if (!changed) continue;

      counters.candidates += 1;
      if (!shouldWrite) continue;

      try {
        const nextLayout = { ...layout, elements: nextElements };
        await client.query("UPDATE frames SET layout = $1, updated_at = NOW() WHERE id = $2", [
          JSON.stringify(nextLayout),
          row.id,
        ]);
        counters.updated += 1;
      } catch (error) {
        counters.failed += 1;
        console.warn(`⚠️ Failed frame ${row.id}: ${error.message}`);
      }
    }

    console.log("\n📊 Summary");
    console.log(`Total frames         : ${counters.total}`);
    console.log(`No slots             : ${counters.noSlots}`);
    console.log(`No layout.elements   : ${counters.noLayoutElements}`);
    console.log(`No photo elements    : ${counters.noPhotoElements}`);
    console.log(`Candidates           : ${counters.candidates}`);
    if (shouldWrite) {
      console.log(`Updated              : ${counters.updated}`);
      console.log(`Failed               : ${counters.failed}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  console.error("❌ Migration failed:", error);
  process.exit(1);
});
