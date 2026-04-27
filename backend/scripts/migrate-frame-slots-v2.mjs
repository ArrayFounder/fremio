/**
 * Migration: Normalize legacy frame slots to Slot Schema V2.
 *
 * Rules:
 * - duplicate mode: left/right slot counts equal AND no slot crosses vertical centerline
 * - duplicate numbering: left top->bottom 1..N, right top->bottom N..1
 * - single mode otherwise: row-major (top->bottom, left->right) 1..N
 *
 * Behavior:
 * - Dry-run by default (no DB writes)
 * - Use --write to apply updates
 * - Use --force to reprocess rows already marked slotSchemaVersion=2
 * - Optional: --limit=200 to cap processed rows
 *
 * Examples:
 *   node scripts/migrate-frame-slots-v2.mjs
 *   node scripts/migrate-frame-slots-v2.mjs --write
 *   node scripts/migrate-frame-slots-v2.mjs --write --force --limit=500
 */

import pg from "pg";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

try {
  const dotenv = require("dotenv");
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
} catch {
  // Ignore when dotenv is unavailable and env vars are already present.
}

const args = process.argv.slice(2);
const shouldWrite = args.includes("--write") || args.includes("--apply");
const force = args.includes("--force");
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : null;

const toFiniteNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sortByTopThenLeft = (a, b) => {
  if (Math.abs(a.top - b.top) > 0.0001) return a.top - b.top;
  return a.left - b.left;
};

const computeSlotMaps = (slots) => {
  const geometry = slots
    .map((slot, index) => {
      const left = toFiniteNumber(slot?.left, 0);
      const top = toFiniteNumber(slot?.top, 0);
      const width = toFiniteNumber(slot?.width, 0);
      const height = toFiniteNumber(slot?.height, 0);
      return {
        index,
        left,
        top,
        width,
        height,
        right: left + width,
      };
    })
    .filter((slot) => slot.width > 0 && slot.height > 0);

  const slotNumberMap = {};
  const photoIndexMap = {};

  if (geometry.length === 0) {
    return { mode: "single", slotNumberMap, photoIndexMap };
  }

  const crossesCenter = geometry.some((slot) => slot.left < 0.5 && slot.right > 0.5);
  const leftSlots = geometry.filter((slot) => slot.right <= 0.5);
  const rightSlots = geometry.filter((slot) => slot.left >= 0.5);

  const isDuplicateMode =
    !crossesCenter &&
    leftSlots.length > 0 &&
    leftSlots.length === rightSlots.length &&
    leftSlots.length + rightSlots.length === geometry.length;

  if (isDuplicateMode) {
    leftSlots.sort(sortByTopThenLeft);
    rightSlots.sort(sortByTopThenLeft);

    const rowCount = leftSlots.length;

    leftSlots.forEach((slot, idx) => {
      slotNumberMap[slot.index] = idx + 1;
      photoIndexMap[slot.index] = idx;
    });

    rightSlots.forEach((slot, idx) => {
      const displayNumber = rowCount - idx;
      slotNumberMap[slot.index] = displayNumber;
      photoIndexMap[slot.index] = displayNumber - 1;
    });

    return { mode: "duplicate", slotNumberMap, photoIndexMap };
  }

  [...geometry].sort(sortByTopThenLeft).forEach((slot, idx) => {
    slotNumberMap[slot.index] = idx + 1;
    photoIndexMap[slot.index] = idx;
  });

  return { mode: "single", slotNumberMap, photoIndexMap };
};

const normalizeSlotsV2 = (rawSlots) => {
  const sourceSlots = Array.isArray(rawSlots) ? rawSlots : [];
  const { mode, slotNumberMap, photoIndexMap } = computeSlotMaps(sourceSlots);

  const normalizedSlots = sourceSlots.map((slot, index) => ({
    ...slot,
    slotNumber: slotNumberMap[index] ?? index + 1,
    photoIndex: photoIndexMap[index] ?? index,
  }));

  return {
    mode,
    duplicatePhotos: mode === "duplicate",
    slots: normalizedSlots,
  };
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

const parseLayout = (layout) => {
  if (!layout) return {};
  if (typeof layout === "string") {
    try {
      return JSON.parse(layout);
    } catch {
      return {};
    }
  }
  if (typeof layout === "object") return { ...layout };
  return {};
};

const parseSlots = (slots) => {
  if (!slots) return [];
  if (Array.isArray(slots)) return slots;
  if (typeof slots === "string") {
    try {
      const parsed = JSON.parse(slots);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function run() {
  const client = await pool.connect();

  const counters = {
    totalFetched: 0,
    noSlots: 0,
    alreadyV2: 0,
    unchanged: 0,
    candidates: 0,
    updated: 0,
    failed: 0,
    duplicateMode: 0,
    singleMode: 0,
  };

  try {
    console.log("🔍 Scanning frames for Slot Schema V2 migration...");
    if (!shouldWrite) {
      console.log("⚠️  DRY RUN (default) - no changes will be written");
      console.log("    Use --write to apply updates.\n");
    }
    if (force) {
      console.log("⚠️  Force mode enabled - reprocessing rows marked as v2\n");
    }

    let query = "SELECT id, slots, layout FROM frames WHERE is_active = true ORDER BY created_at DESC";
    const params = [];

    if (Number.isFinite(limit) && limit > 0) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await client.query(query, params);
    counters.totalFetched = result.rows.length;

    for (const row of result.rows) {
      const frameId = row.id;
      const slots = parseSlots(row.slots);

      if (slots.length === 0) {
        counters.noSlots += 1;
        continue;
      }

      const layout = parseLayout(row.layout);
      const currentVersion = Number(layout.slotSchemaVersion || 0);

      if (!force && currentVersion >= 2) {
        counters.alreadyV2 += 1;
        continue;
      }

      const nextMeta = normalizeSlotsV2(slots);
      const nextLayout = {
        ...layout,
        slotSchemaVersion: 2,
        captureMode: nextMeta.mode,
        duplicatePhotos: nextMeta.duplicatePhotos,
      };

      const slotsChanged = !deepEqual(slots, nextMeta.slots);
      const layoutChanged = !deepEqual(layout, nextLayout);

      if (!slotsChanged && !layoutChanged) {
        counters.unchanged += 1;
        continue;
      }

      counters.candidates += 1;
      if (nextMeta.mode === "duplicate") counters.duplicateMode += 1;
      else counters.singleMode += 1;

      if (!shouldWrite) {
        continue;
      }

      try {
        await client.query(
          "UPDATE frames SET slots = $1, layout = $2 WHERE id = $3",
          [JSON.stringify(nextMeta.slots), JSON.stringify(nextLayout), frameId]
        );
        counters.updated += 1;
      } catch (error) {
        counters.failed += 1;
        console.warn(`⚠️  Failed updating ${frameId}: ${error.message}`);
      }
    }

    console.log("\n📊 Migration Summary");
    console.log(`Total fetched         : ${counters.totalFetched}`);
    console.log(`No slots              : ${counters.noSlots}`);
    console.log(`Already schema v2     : ${counters.alreadyV2}`);
    console.log(`Already unchanged     : ${counters.unchanged}`);
    console.log(`Candidates            : ${counters.candidates}`);
    console.log(`  - duplicate mode    : ${counters.duplicateMode}`);
    console.log(`  - single mode       : ${counters.singleMode}`);

    if (shouldWrite) {
      console.log(`Updated               : ${counters.updated}`);
      console.log(`Failed                : ${counters.failed}`);
      if (counters.failed === 0) {
        console.log("✅ Write migration completed");
      } else {
        console.log("⚠️  Write migration finished with failures");
      }
    } else {
      console.log("✅ Dry-run completed (no writes)");
      console.log("Run with --write to apply changes");
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
