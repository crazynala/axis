/*
  Import sample Excel data for inventory into Postgres via Prisma.
  Files read from ./sample_data:
    - Locations_*.xlsx -> Location
    - Product_Batches_*.xlsx -> Batch
    - Product_Movements_*.xlsx -> ProductMovement
    - Product_Movement_Lines_*.xlsx -> ProductMovementLine
*/
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const root = process.cwd();
const dataDir = path.join(root, "sample_data");
let SKU_MAP = null; // lazy-loaded Map<UPPER_TRIM(sku), id>

async function getSkuMap() {
  if (SKU_MAP) return SKU_MAP;
  SKU_MAP = new Map();
  const all = await prisma.product.findMany({ select: { id: true, sku: true } });
  for (const p of all) {
    if (!p.sku) continue;
    SKU_MAP.set(p.sku.toString().trim().toUpperCase(), p.id);
  }
  return SKU_MAP;
}

function findFirstFile(regex) {
  const files = fs.readdirSync(dataDir);
  return files.find((f) => regex.test(f));
}

function sheetToObjects(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
}

function toDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function toNum(val) {
  if (val == null || val === "") return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

async function importLocations() {
  const f = findFirstFile(/^Locations_.*\.xlsx$/i);
  if (!f) return { count: 0, file: null };
  const rows = sheetToObjects(path.join(dataDir, f));
  let count = 0;
  for (const r of rows) {
    const data = {
      id: toNum(r.id),
      name: r.name ?? r.Name ?? r.location_name ?? null,
      type: r.type ?? r.Type ?? null,
      is_active: r.is_active ?? r.isActive ?? r.active ?? null,
      notes: r.notes ?? null,
    };
    try {
      await prisma.location.create({ data });
      count++;
    } catch (_) {}
  }
  return { count, file: f };
}

async function importBatches() {
  const f = findFirstFile(/^Product_Batches_.*\.xlsx$/i);
  if (!f) return { count: 0, file: null };
  const rows = sheetToObjects(path.join(dataDir, f));
  let count = 0;
  for (const r of rows) {
    const data = {
      id: toNum(r.id),
      productId: toNum(r.productId ?? r.product_id ?? r.productID),
      locationId: toNum(r.locationId ?? r.location_id ?? r.locationID),
      batchCode: r.batchCode ?? r.batch_code ?? null,
      name: r.name ?? null,
      source: r.source ?? null,
      quantity: toNum(r.quantity ?? r.qty),
      receivedAt: toDate(r.receivedAt ?? r.received_at ?? r.received),
      notes: r.notes ?? null,
    };
    try {
      await prisma.batch.create({ data });
      count++;
    } catch (_) {}
  }
  return { count, file: f };
}

// movement type classification (mirror app logic)
const IN_TYPES = ["in", "receive", "purchase", "adjust_in", "return_in", "return", "transfer_in", "po (receive)", "shipping (in)"];
const OUT_TYPES = ["out", "issue", "consume", "ship", "sale", "deliver", "adjust_out", "transfer_out", "shipping (out)", "po (return)", "assembly", "expense"];

async function resolveLocationId(fromNameOrId, toNameOrId, rawType) {
  const type = (rawType || "").toString().trim().toLowerCase();
  const isIn = IN_TYPES.includes(type);
  const isOut = OUT_TYPES.includes(type);
  const choose = isOut ? fromNameOrId : toNameOrId; // for OUT use FROM, for IN use TO
  let id = toNum(choose);
  if (id) {
    const exists = await prisma.location.findUnique({ where: { id } });
    if (exists) return id;
  }
  const name = (choose || "").toString().trim();
  if (!name) return null;
  let loc = await prisma.location.findFirst({ where: { name } });
  if (!loc) {
    try {
      loc = await prisma.location.create({ data: { name } });
    } catch (_) {}
  }
  return loc?.id ?? null;
}

async function ensureMovementFromRow(r) {
  // Map provided headers
  const serial = toNum(r.a__Serial ?? r.Serial ?? r.id);
  const type = (r.Type ?? r.type ?? "").toString();
  const date = toDate(r.Date ?? r.date);
  const from = r.a_LocationID_Out ?? r.Movement_From ?? r.From;
  const to = r.a_LocationID_In ?? r.Movement_To ?? r.To;
  const locationId = await resolveLocationId(from, to, type);
  const data = { id: serial ?? undefined, movementType: type || null, date, locationId, notes: r.SourceDetails ?? r.notes ?? null };
  let mv = null;
  try {
    mv = await prisma.productMovement.create({ data });
  } catch (_) {
    try {
      mv = await prisma.productMovement.update({ where: { id: serial }, data });
    } catch (_) {}
  }
  return mv?.id ?? null;
}

async function importProductMovements() {
  const f = findFirstFile(/^Product_Movements_.*\.xlsx$/i) || findFirstFile(/^Product_Movement.*\.xlsx$/i);
  if (!f) return { count: 0, file: null };
  const rows = sheetToObjects(path.join(dataDir, f));
  let count = 0;
  for (const r of rows) {
    const id = await ensureMovementFromRow(r);
    if (id) count++;
  }
  return { count, file: f };
}

async function importProductMovementLines() {
  const f = findFirstFile(/^Product_Movement_Lines_.*\.xlsx$/i) || findFirstFile(/^Product_Movements_.*\.xlsx$/i);
  if (!f) return { count: 0, file: null };
  const rows = sheetToObjects(path.join(dataDir, f));
  let count = 0,
    skippedMissingProduct = 0,
    skippedMissingMovement = 0;
  const sampleSkus = new Set();
  const skuMap = await getSkuMap();
  for (const r of rows) {
    // link to movement
    const movementId = await ensureMovementFromRow(r);
    // product by code -> id
    const rawCode = (r.a_ProductCode ?? r.productCode ?? r.ProductCode ?? "").toString();
    const trimmed = rawCode.trim();
    const codeKey = trimmed.toUpperCase();
    let productId = toNum(r.productId ?? r.product_id);
    if (!productId && codeKey) {
      productId = skuMap.get(codeKey) ?? null;
    }
    // If still not found, treat purely numeric code as Product.id
    if (!productId && /^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && parsed > 0) {
        const exists = await prisma.product.findUnique({ where: { id: parsed }, select: { id: true } });
        if (exists) productId = parsed;
      }
    }
    if (!movementId) {
      skippedMissingMovement++;
      continue;
    }
    if (!productId) {
      if (sampleSkus.size < 20 && codeKey) sampleSkus.add(codeKey);
      skippedMissingProduct++;
      continue;
    }
    const quantity = toNum(r.Quantity ?? r.quantity ?? r.Qty ?? r.qty);
    const data = {
      // allow id passthrough if a stable id exists
      id: toNum(r.id) ?? undefined,
      movementId,
      productId,
      batchId: toNum(r.batchId ?? r.batch_id ?? r.batchID),
      quantity,
      notes: r.SourceDetails ?? r.notes ?? null,
    };
    try {
      await prisma.productMovementLine.create({ data });
      count++;
    } catch (_) {}
  }
  if (sampleSkus.size) console.log("Example unmatched product codes (first 20):", Array.from(sampleSkus));
  if (skippedMissingProduct || skippedMissingMovement) console.log({ skippedMissingProduct, skippedMissingMovement });
  return { count, file: f };
}

(async () => {
  console.log("Importing sample data from", dataDir);
  const loc = await importLocations();
  console.log("Locations ->", loc);
  const mov = await importProductMovements();
  console.log("ProductMovements ->", mov);
  const lines = await importProductMovementLines();
  console.log("ProductMovementLines ->", lines);
  const bat = await importBatches();
  console.log("Batches ->", bat);
  // Refresh MV so snapshots reflect imported data
  try {
    await prisma.$executeRawUnsafe(
      "REFRESH MATERIALIZED VIEW product_stock_snapshot"
    );
    console.log("Refreshed product_stock_snapshot");
  } catch (e) {
    console.warn("Failed to refresh product_stock_snapshot", e?.message || e);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
