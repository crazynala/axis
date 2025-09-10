#!/usr/bin/env ts-node
/*
 Enhanced spec conformance script.
 - Ensures each JOB_DATES_STATUS_FIELDS key appears in jobs.$id.tsx
 - Ensures ASSEMBLY_QUANTITY_ROWS labels appear in assembly route.
 - Ensures core product / invoice / purchase order spec fields appear in their routes.
 - Cross-checks job & product FieldConfig exports so every configured field shows in route.
 - Warns (non-fatal) if a spec field is not referenced by any FieldConfig (possible drift) and if a config field is not in spec set (except explicitly allowed non-spec fields like id).
*/
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  JOB_DATES_STATUS_FIELDS,
  ASSEMBLY_QUANTITY_ROWS,
  PRODUCT_DETAIL_CORE_FIELDS,
  INVOICE_DETAIL_FIELDS,
  PURCHASE_ORDER_DETAIL_FIELDS,
} from "../app/constants/spec";

// Naive extraction of FieldConfig names from config files (simple regex parse)
function extractFieldNames(src: string): string[] {
  const names: string[] = [];
  const rx = /name:\s*"([A-Za-z0-9_]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(src))) names.push(m[1]);
  return Array.from(new Set(names));
}

// __dirname replacement for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);
const root = path.resolve(__dirnameLocal, "..");

function file(p: string) {
  return fs.readFileSync(path.join(root, p), "utf8");
}

function safeFile(p: string) {
  try {
    return file(p);
  } catch {
    return "";
  }
}
const jobDetail = safeFile("app/routes/jobs.$id.tsx");
const assemblyDetail = safeFile(
  "app/routes/jobs.$jobId.assembly.$assemblyId.tsx"
);
const productDetail = safeFile("app/routes/products.$id.tsx");
// Config sources
const jobConfigSrc = safeFile("app/formConfigs/jobDetail.tsx");
const productConfigSrc = safeFile("app/formConfigs/productDetail.tsx");
const jobConfigFields = extractFieldNames(jobConfigSrc);
const productConfigFields = extractFieldNames(productConfigSrc);

const allowNonSpec = new Set([
  "id",
  "companyId",
  "customerId",
  "supplierId",
  "variantSet",
  "variantSetId",
  "purchaseTaxId",
]);
const invoiceDetail = safeFile("app/routes/invoices.$id.tsx");
const poDetail = safeFile("app/routes/purchase-orders.$id.tsx");

let ok = true;

for (const f of JOB_DATES_STATUS_FIELDS) {
  if (!jobDetail.includes(f)) {
    console.error(`[spec] Missing job field in jobs.$id.tsx: ${f}`);
    ok = false;
  }
}
// Config vs spec for jobs
for (const f of jobConfigFields) {
  if (
    !(JOB_DATES_STATUS_FIELDS as unknown as string[]).includes(f) &&
    !allowNonSpec.has(f)
  ) {
    console.warn(
      `[spec][warn] Job config field not in JOB_DATES_STATUS_FIELDS: ${f}`
    );
  }
  if (!jobDetail.includes(f)) {
    console.error(`[spec] Job config field not rendered in jobs.$id.tsx: ${f}`);
    ok = false;
  }
}
for (const f of JOB_DATES_STATUS_FIELDS as unknown as string[]) {
  if (!jobConfigFields.includes(f)) {
    console.warn(`[spec][warn] Spec job field not in job config: ${f}`);
  }
}
for (const label of ASSEMBLY_QUANTITY_ROWS) {
  if (!assemblyDetail.includes(label)) {
    console.error(
      `[spec] Missing assembly quantity row label in assembly route: ${label}`
    );
    ok = false;
  }
}
for (const f of PRODUCT_DETAIL_CORE_FIELDS) {
  if (productDetail && !productDetail.includes(f)) {
    console.error(`[spec] Missing product field in products.$id.tsx: ${f}`);
    ok = false;
  }
}
// Config vs spec for products
for (const f of productConfigFields) {
  if (
    !(PRODUCT_DETAIL_CORE_FIELDS as unknown as string[]).includes(f) &&
    !allowNonSpec.has(f)
  ) {
    console.warn(
      `[spec][warn] Product config field not in PRODUCT_DETAIL_CORE_FIELDS: ${f}`
    );
  }
  if (!productDetail.includes(f)) {
    console.error(
      `[spec] Product config field not rendered in products.$id.tsx: ${f}`
    );
    ok = false;
  }
}
for (const f of PRODUCT_DETAIL_CORE_FIELDS as unknown as string[]) {
  if (!productConfigFields.includes(f)) {
    console.warn(`[spec][warn] Spec product field not in product config: ${f}`);
  }
}
for (const f of INVOICE_DETAIL_FIELDS) {
  if (invoiceDetail && !invoiceDetail.includes(f)) {
    console.error(`[spec] Missing invoice field in invoices.$id.tsx: ${f}`);
    ok = false;
  }
}
for (const f of PURCHASE_ORDER_DETAIL_FIELDS) {
  if (poDetail && !poDetail.includes(f)) {
    console.error(
      `[spec] Missing purchase order field in purchase-orders.$id.tsx: ${f}`
    );
    ok = false;
  }
}
if (!ok) {
  process.exit(1);
} else {
  console.log("[spec] All required spec fields present.");
}
