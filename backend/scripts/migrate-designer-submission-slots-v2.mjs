/**
 * Migration: Normalize designer_submissions.frame_data.slots to Slot Schema V2.
 *
 * - Dry-run by default
 * - Use --write to apply changes
 * - Optional: --limit=200
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
    slots: normalizedSlots,
    duplicatePhotos: mode === "duplicate",
  };
};

const parseFrameData = (raw) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return { ...raw };
  return null;
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
    totalFetched: 0,
    noFrameData: 0,
    noSlots: 0,
    alreadyV2: 0,
    candidates: 0,
    updated: 0,
    failed: 0,
    duplicateMode: 0,
    singleMode: 0,
  };

  try {
    console.log("🔍 Scanning designer_submissions for slot normalization...");
    if (!shouldWrite) {
      console.log("⚠️  DRY RUN (default) - no DB writes");
      console.log("    Use --write to apply updates.\n");
    }

    let query = `
      SELECT id, status, frame_data
      FROM designer_submissions
      ORDER BY submitted_at DESC
    `;
    const params = [];

    if (Number.isFinite(limit) && limit > 0) {
      params.push(limit);
      query += ` LIMIT $${params.length}`;
    }

    const result = await client.query(query, params);
    counters.totalFetched = result.rows.length;

    for (const row of result.rows) {
      const frameData = parseFrameData(row.frame_data);
      if (!frameData || typeof frameData !== "object") {
        counters.noFrameData += 1;
        continue;
      }

      const slots = Array.isArray(frameData.slots) ? frameData.slots : [];
      if (slots.length === 0) {
        counters.noSlots += 1;
        continue;
      }

      const hasSlotNumber = slots.every((slot, idx) => Number.isFinite(Number(slot?.slotNumber ?? idx + 1)));
      const hasPhotoIndex = slots.every((slot, idx) => Number.isFinite(Number(slot?.photoIndex ?? idx)));
      if (!force && hasSlotNumber && hasPhotoIndex) {
        counters.alreadyV2 += 1;
        continue;
      }

      const nextMeta = normalizeSlotsV2(slots);
      const nextFrameData = {
        ...frameData,
        slots: nextMeta.slots,
        duplicatePhotos: nextMeta.duplicatePhotos,
      };

      if (deepEqual(frameData, nextFrameData)) {
        counters.alreadyV2 += 1;
        continue;
      }

      counters.candidates += 1;
      if (nextMeta.mode === "duplicate") counters.duplicateMode += 1;
      else counters.singleMode += 1;

      if (!shouldWrite) continue;

      try {
        await client.query(
          `UPDATE designer_submissions SET frame_data = $1::jsonb WHERE id = $2`,
          [JSON.stringify(nextFrameData), row.id]
        );
        counters.updated += 1;
      } catch (error) {
        counters.failed += 1;
        console.warn(`⚠️  Failed updating submission ${row.id}: ${error.message}`);
      }
    }

    console.log("\n📊 Migration Summary");
    console.log(`Total fetched         : ${counters.totalFetched}`);
    console.log(`No frame_data         : ${counters.noFrameData}`);
    console.log(`No slots              : ${counters.noSlots}`);
    console.log(`Already normalized    : ${counters.alreadyV2}`);
    console.log(`Candidates            : ${counters.candidates}`);
    console.log(`  - duplicate mode    : ${counters.duplicateMode}`);
    console.log(`  - single mode       : ${counters.singleMode}`);

    if (shouldWrite) {
      console.log(`Updated               : ${counters.updated}`);
      console.log(`Failed                : ${counters.failed}`);
      if (counters.failed === 0) console.log("✅ Write migration completed");
      else console.log("⚠️  Write migration completed with failures");
    } else {
      console.log("✅ Dry-run completed (no writes)");
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
