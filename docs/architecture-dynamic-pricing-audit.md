# Dynamic Pricing Audit (Audit-Grade)

## 1) Executive summary
- Pricing is primarily product-driven: Product fields (costPrice, manualSalePrice, manualMargin, cost/sale tiers) are copied or computed into downstream documents (PO lines, costings, invoice lines) and then treated as snapshots. Evidence: PO finalize snapshots in `app/modules/purchaseOrder/routes/purchase-orders.$id.tsx`, costing seeding in `app/modules/job/services/assemblyFromProduct.server.ts`, invoice line creation in `app/modules/invoice/services/invoicing.ts`.
- Draft purchase orders show **live computed prices** from Product + tiers + margin/multiplier; once FINAL/RECEIVING/COMPLETE/CANCELED, line pricing is effectively locked. Evidence: draft calc in `app/modules/purchaseOrder/components/PurchaseOrderLinesTable.tsx`, line update rules in `app/modules/purchaseOrder/routes/purchase-orders.$id.tsx`.
- Costing “sell” suggestions are computed at view time from manual overrides and sale tiers, but **invoice lines are snapped** at creation time and do not re-resolve if costings/products change. Evidence: `app/modules/job/components/AssemblyCostingsTable.tsx`, `app/modules/invoice/services/invoicing.ts`, `app/modules/invoice/services/util.ts`.
- Audit logging exists but does **not** cover pricing changes. OperationLog is used for assembly group events and reservation trimming/settle, with TODOs for job state changes; no pricing logs found. Evidence: `app/modules/job/services/assemblyGroupEvents.server.ts`, `app/modules/materials/services/reservations.server.ts`, `app/modules/job/services/actions/jobDetailUpdate.server.ts`.

## 2) Current-state pricing audit

### 2.1 Model inventory (price/cost fields)
**Product** (`prisma/schema.prisma`)
```
model Product {
  costPrice       Decimal?
  manualSalePrice Decimal?
  manualMargin    Decimal?
  costGroupId     Int?
  salePriceGroupId Int?
  costCurrency    String? @default("USD")
  ...
}
```
**Costing** (`prisma/schema.prisma`)
```
model Costing {
  unitCost        Decimal?
  salePricePerItem Decimal?
  salePriceGroupId Int?
  manualSalePrice Decimal?
  manualMargin    Decimal?
  ...
}
```
**PurchaseOrderLine** (`prisma/schema.prisma`)
```
model PurchaseOrderLine {
  priceCost       Decimal?
  priceSell       Decimal?
  taxRate         Decimal?
  quantityOrdered Decimal?
  quantity        Decimal?
  ...
}
```
**InvoiceLine** (`prisma/schema.prisma`)
```
model InvoiceLine {
  priceSell           Decimal?
  invoicedPrice       Decimal?
  invoicedTotalManual Decimal?
  quantity            Decimal?
  ...
}
```

### 2.2 Inputs & precedence truth tables

#### PO line pricing (Draft)
**Source**: live computation in `getLivePrices` (`app/modules/purchaseOrder/components/PurchaseOrderLinesTable.tsx`)
```
const cost = Number(prod.costPrice || 0);
const hasManualSell = prod.manualSalePrice != null || prod.c_isSellPriceManual === true;
if (hasManualSell) { manualSalePrice -> calcPrice(manualSalePrice) }
const tiers = (prod.costGroup?.costRanges || []).map(rangeFrom/costPrice);
const marginPct = marginOverride ?? vendorDefaultMargin ?? globalDefaultMargin;
const priceMultiplier = pricingPrefs?.priceMultiplier;
calcPrice({ baseCost: cost, tiers, taxRate, qty, marginPct, priceMultiplier })
```
**Truth table (Draft):**
| Output | Inputs | Precedence / Rules | Evidence |
|---|---|---|---|
| unitCost | Product.costPrice or costGroup tier | costGroup tier picks by qty (minQty <= qty). Base fallback costPrice | `PurchaseOrderLinesTable.tsx` (getLivePrices tiers + calcPrice) |
| unitSell | manualSalePrice OR cost+margin | manualSalePrice wins; else calcPrice using tiers, marginPct, priceMultiplier | `PurchaseOrderLinesTable.tsx` |
| taxRate | Product.purchaseTax.value | used by calcPrice | `PurchaseOrderLinesTable.tsx` |
| qty basis | line.quantityOrdered | qty <= 0 coerced to 1 | `PurchaseOrderLinesTable.tsx` |

#### PO line pricing (Finalize)
**Source**: snapshot in `po.update` when transitioning to FINAL (`app/modules/purchaseOrder/routes/purchase-orders.$id.tsx`)
```
if (isFinalizing) {
  const prod = await prisma.product.findUnique({ costPrice, manualSalePrice, purchaseTax });
  const sell = prod.manualSalePrice ?? ProductPricingService.getAutoSellPrice(pid, qty);
  const cost = prod.costPrice;
  await prisma.purchaseOrderLine.update({ priceCost: cost, priceSell: sell, taxRate, quantity: quantityOrdered });
}
```
**Truth table (Finalize):**
| Output | Inputs | Precedence / Rules | Evidence |
|---|---|---|---|
| priceCost | Product.costPrice | direct copy; no tier lookup | `purchase-orders.$id.tsx` |
| priceSell | Product.manualSalePrice OR ProductPricingService.getAutoSellPrice | manualSalePrice wins; else auto price from tiers/cost groups | `purchase-orders.$id.tsx`, `ProductPricingService.ts` |
| taxRate | Product.purchaseTax.value | direct copy | `purchase-orders.$id.tsx` |
| quantity | quantityOrdered | snapshot to `quantity` | `purchase-orders.$id.tsx` |

#### Costing unitCost resolution
**Sources**:
- Assembly creation: `assemblyFromProduct.server.ts` sets `unitCost = productLine.unitCost ?? child.costPrice`.
- Refresh: `costingRefreshProduct.server.ts` resolves `unitCost`.
```
// Refresh precedence
if (matchedLine?.unitCost != null) return matchedLine.unitCost;
if (matchedLine?.unitCostManual != null) return matchedLine.unitCostManual;
return childProduct.costPrice ?? costing.unitCost ?? 0;
```
**Decision tree (Costing.unitCost):**
1) ProductLine.unitCost (if present)
2) ProductLine.unitCostManual (if present)
3) Child Product.costPrice
4) Existing Costing.unitCost fallback
Evidence: `app/modules/job/services/actions/costingRefreshProduct.server.ts`.

#### Costing sell price suggestion
**Source**: `computeSell` in `app/modules/job/components/AssemblyCostingsTable.tsx`
```
if (fixedSell != null) return manual;
calcPrice({ baseCost: unitCost, saleTiers, manualSalePrice, marginPct, priceMultiplier })
```
Sale tiers precedence is defined in `app/modules/job/services/costingsView.ts`:
```
// costing.salePriceGroup > product.salePriceGroup > product.salePriceRanges
const saleTiers = tiersFromCosting || tiersFromProductGroup || tiersFromProduct;
```
**Decision tree (sell suggestion):**
1) Costing.salePricePerItem (fixed)
2) Costing.manualSalePrice
3) Sale tiers (costing group > product group > product ranges) + priceMultiplier + marginPct
Evidence: `AssemblyCostingsTable.tsx`, `costingsView.ts`.

#### Invoice line unit price resolution
**Source**: `createInvoiceLines` sets `priceSell` + `invoicedPrice` from submitted unitPrice. (`app/modules/invoice/services/invoicing.ts`)
```
priceSell: unitPrice,
invoicedPrice: unitPrice,
```
**Total calculation**: `computeInvoiceLineTotal` (`app/modules/invoice/services/util.ts`)
```
if (invoicedTotalManual != null) return manual;
price = invoicedPrice ?? priceSell;
return qty * price;
```
**Decision tree (invoice totals):**
1) invoicedTotalManual (absolute override)
2) invoicedPrice (per-unit override)
3) priceSell (per-unit snapshot)
Evidence: `invoicing.ts`, `util.ts`.

### 2.3 PO state machine + invariants
**State config** (`app/base/state/configs.ts`):
- States: DRAFT, FINAL, RECEIVING, COMPLETE, CANCELED.
- Transition meta describes pricing lock on FINAL.

**Action invariants** (`app/modules/purchaseOrder/routes/purchase-orders.$id.tsx`):
- DRAFT: productId and quantityOrdered editable; lines created/updated/deleted from client payload.
- Transition to FINAL: line snapshots for `priceCost`, `priceSell`, `taxRate`, `quantity` are written.
- FINAL/RECEIVING: line.quantity may be edited, but not below received; quantityOrdered locked.
- COMPLETE/CANCELED: line updates are ignored (locked).

Evidence snippets:
```
// Finalize: when transitioning into FINAL, lock line copies/prices/qty
if (isFinalizing) { ... priceCost, priceSell, taxRate, quantity ... }
```
```
if ((desiredStatus || "DRAFT") === "DRAFT") { ... update productId, quantityOrdered ... }
else if (desiredStatus && desiredStatus !== "DRAFT") {
  if (desiredStatus === "COMPLETE" || desiredStatus === "CANCELED") continue; // locked
  ... update quantity only ...
}
```

### 2.4 Re-resolution behavior
- **PO lines**: live draft pricing is re-computed in UI only; once FINAL, `priceCost`/`priceSell` are frozen in the DB (`purchase-orders.$id.tsx`). No server-side re-resolution after FINAL.
- **Costings**: `costingRefreshProduct.server.ts` re-pulls product/BOM values and overwrites costing unitCost/manualSalePrice/manualMargin/salePriceGroupId for costings flagged `flagDefinedInProduct`.
- **Invoices**: invoice lines are created with snapshot prices (`createInvoiceLines`). There is no re-resolution logic in `invoices.$id.tsx` or `invoice` services; existing lines are not recomputed when product/costing changes.

## 3) Current-state matrix (audit table)
| Domain | Fields | Source of truth | Override support | Audit trail | Resolver / logic location | Notes |
|---|---|---|---|---|---|---|
| Product | costPrice, manualSalePrice, manualMargin, costGroupId, salePriceGroupId | DB | yes (direct edit) | none found | calcPrice + ProductPricingService | Product is pricing root for PO + Costing | 
| PO Line | priceCost, priceSell, taxRate, quantity | DB snapshot on FINAL | DRAFT live compute; no direct price edit in DRAFT | none found | finalize in `purchase-orders.$id.tsx` | DRAFT uses UI computed pricing; FINAL locks | 
| Costing | unitCost, salePricePerItem, manualSalePrice, manualMargin, salePriceGroupId | DB | yes (manualSalePrice/manualMargin) | none found | `assemblyFromProduct.server.ts`, `costingRefreshProduct.server.ts`, `AssemblyCostingsTable.tsx` | sell suggestion computed at view time | 
| Invoice Line | priceSell, invoicedPrice, invoicedTotalManual | DB snapshot on create | yes (manualTotal/unitPrice inputs) | none found | `createInvoiceLines`, `computeInvoiceLineTotal` | no re-resolution after creation | 
| Job/Assembly | derived from costings | computed in view + stored in Costing | via costing refresh/edit | none found | `costingsView.ts`, `AssemblyCostingsTable.tsx` | invoiceability computed in `invoice/services/costing.ts` | 

## 4) Evidence pack (files inspected)
- `app/modules/purchaseOrder/components/PurchaseOrderLinesTable.tsx`: draft live pricing (`getLivePrices`) and totals in draft vs final; uses `calcPrice` with margin/multiplier.
- `app/modules/purchaseOrder/routes/purchase-orders.$id.tsx`: PO update action; FINAL snapshot of priceCost/priceSell/taxRate; line edit constraints by status.
- `app/base/state/configs.ts`: PO status transitions and lock messaging.
- `app/modules/product/calc/calcPrice.ts`: pricing math (manual override, tiers, cost+margin, rounding).
- `app/modules/product/services/ProductPricingService.ts`: auto sell price for PO finalize (manualSalePrice override; tiers from product/group).
- `app/modules/job/services/assemblyFromProduct.server.ts`: seeds costings from BOM and product values.
- `app/modules/job/services/actions/costingRefreshProduct.server.ts`: refresh rules and unitCost precedence.
- `app/modules/job/services/costingsView.ts`: sale tier precedence and row preparation.
- `app/modules/job/components/AssemblyCostingsTable.tsx`: sell suggestion computed via calcPrice; fixed sell overrides.
- `app/modules/invoice/services/invoicing.ts`: invoice line creation (priceSell/invoicedPrice snapshots).
- `app/modules/invoice/services/util.ts`: invoice total calculation precedence.
- `app/modules/invoice/services/po.ts`: PO invoiceable amounts; uses PO line priceSell.
- `app/routes/invoices.$id.tsx`: invoice detail/action; no re-resolution of line prices.
- `app/modules/job/services/assemblyGroupEvents.server.ts` + `app/modules/materials/services/reservations.server.ts`: OperationLog usage (non-pricing).
- `prisma/schema.prisma`: price/cost fields, tiers, and company margin/multiplier fields.

## 5) Audit logging plan (grounded in code)
### Current logging coverage
- **OperationLog used** for assembly group events and reservations (`assemblyGroupEvents.server.ts`, `reservations.server.ts`).
- **No pricing logs found** for Product/PO/Costing/Invoice writes; job/assembly state changes have TODOs (`jobDetailUpdate.server.ts`).

### Proposed OperationLog actions (missing today)
Add in routes/services that write pricing fields:
- `PRODUCT_PRICING_UPDATE` (when costPrice, manualSalePrice, manualMargin, cost/sale groups change)
  - detail: `{ productId, before: {costPrice,...}, after: {...}, source: "product.edit" }`
- `PO_FINALIZE_PRICING_SNAPSHOT` (on FINAL transition)
  - detail: `{ purchaseOrderId, lineId, productId, priceCost, priceSell, taxRate, qtyOrdered, source: "po.finalize" }`
- `PO_LINE_QTY_UPDATE` (FINAL/RECEIVING quantity changes)
  - detail: `{ lineId, before: {quantity}, after: {quantity}, status }`
- `COSTING_REFRESH_FROM_PRODUCT` (costingRefreshProduct)
  - detail: `{ costingId, productId, before: {...}, after: {...}, source: "costing.refresh" }`
- `COSTING_MANUAL_PRICING_UPDATE` (manualSalePrice/manualMargin edits)
  - detail: `{ costingId, before, after }`
- `INVOICE_LINE_CREATE` (createInvoiceLines)
  - detail: `{ invoiceId, sourceType, sourceId, unitPrice, quantity, manualTotal }`
- `INVOICE_LINE_UPDATE` (if any line edit endpoints exist later)

## 6) Inputs & precedence decision trees (explicit)
### a) Costing.unitCost resolution
1) ProductLine.unitCost (BOM line)
2) ProductLine.unitCostManual
3) Product.costPrice
4) Existing Costing.unitCost fallback
Evidence: `costingRefreshProduct.server.ts`.

### b) Costing sell price suggestion
1) Costing.salePricePerItem (fixed)
2) Costing.manualSalePrice
3) Sale tiers (costing.salePriceGroup > product.salePriceGroup > product.salePriceRanges)
4) Cost+margin fallback (calcPrice with marginPct)
Evidence: `AssemblyCostingsTable.tsx`, `costingsView.ts`, `calcPrice.ts`.

### c) Invoice line unit price resolution
1) invoicedTotalManual
2) invoicedPrice
3) priceSell
Evidence: `computeInvoiceLineTotal`.

## 7) Test plan (automated)
### Unit/integration tests (8+)
1) **PO finalize snapshot**: DRAFT -> FINAL writes priceCost/priceSell/taxRate/quantity based on product + ProductPricingService (mock product + tiers). (`purchase-orders.$id.tsx`)
2) **PO DRAFT live calc**: live price uses manualSalePrice override; tiers used when manual is absent. (`PurchaseOrderLinesTable.tsx`, `calcPrice.ts`)
3) **PO status gating**: in FINAL/RECEIVING, quantityOrdered cannot change; in COMPLETE/CANCELED, quantity changes ignored. (`purchase-orders.$id.tsx`)
4) **Costing refresh precedence**: unitCost uses unitCost > unitCostManual > product costPrice. (`costingRefreshProduct.server.ts`)
5) **Sale tier precedence**: costing.salePriceGroup beats product.salePriceGroup beats product.salePriceRanges. (`costingsView.ts`)
6) **Invoice line total precedence**: invoicedTotalManual overrides invoicedPrice and priceSell. (`util.ts`)
7) **PO invoice pending**: pending amounts use PO line priceSell and qtyReceived/quantityOrdered. (`invoice/services/po.ts`)
8) **calcPrice rounding**: rounding to cents for unit and extended amounts; manualSalePrice bypasses tax. (`calcPrice.ts`)

### UI tests (if Playwright exists)
1) PO DRAFT shows live pricing and updates with qty changes; FINAL locks pricing display.
2) Costing table shows manual sale price override vs tiered price; refresh product updates unit cost.
3) Invoice add-lines uses defaultUnitPrice from costing/PO and creates line with that unit price.

## 8) Proposed curve-native architecture (product-centric)
### Schema additions (Prisma-style)
```
enum ProductCostingMode { FIXED CURVE FORMULA MANUAL }

model Product {
  costingMode ProductCostingMode @default(FIXED)
  costingRefId Int? // points to a pricing definition
  // existing fields remain
}

model PriceCurve {
  id Int @id @default(autoincrement())
  code String @unique
  label String
  uom String? // e.g., "piece", "meter"
  baseMoq Int? // default MOQ
  notes String?
  tiers PriceTier[]
}

model PriceTier {
  id Int @id @default(autoincrement())
  curveId Int
  qtyBreakpoint Int
  unitPrice Decimal @db.Decimal(14,4)
  curve PriceCurve @relation(fields: [curveId], references: [id])
  @@index([curveId, qtyBreakpoint])
}

model PricingProfile {
  id Int @id @default(autoincrement())
  curveId Int
  serviceType String? // CMT, embroidery, etc
  categoryId Int?
  subCategoryId Int?
  complexity String?
  defaultMultiplier Decimal? @db.Decimal(14,4)
  defaultMoq Int?
  curve PriceCurve @relation(fields: [curveId], references: [id])
  @@index([categoryId, subCategoryId])
}

model CustomerPricingOverride {
  id Int @id @default(autoincrement())
  customerId Int
  profileId Int
  multiplier Decimal? @db.Decimal(14,4)
  moqOverride Int?
  curveOverrideId Int?
  @@unique([customerId, profileId])
}
```

### Resolver module spec
```
export type PricingContext = {
  productId: number
  customerId?: number | null
  qty: number
  uom?: string | null
  date?: Date | null
  source?: "PO" | "COSTING" | "INVOICE" | "QUOTE"
};

export type PricingSnapshot = {
  mode: "FIXED" | "CURVE" | "FORMULA" | "MANUAL"
  curveId?: number
  profileId?: number
  tier?: { qtyBreakpoint: number; unitPrice: string }
  multiplier?: string
  moq?: number
  baseCost?: string
  resolvedUnitPrice: string
  currency?: string
  rounding?: { precision: number; method: "round" | "ceil" | "floor" }
  provenance: { productId: number; customerId?: number | null }
};

export async function resolveUnitPrice(ctx: PricingContext): Promise<{ unitPrice: number; snapshot: PricingSnapshot }>
```

### Tier selection semantics + rounding
- Tiers sorted by qtyBreakpoint; choose the **highest tier where qty >= breakpoint**.
- MOQ: effective qty = max(qty, moqOverride ?? profile.defaultMoq ?? curve.baseMoq ?? 1).
- Rounding: round to currency precision (2 decimals) at unit price, then extended total. Align with existing `calcPrice.ts` rounding behavior (2 decimals).

### Customer MOQ/multiplier overrides
- Use `CustomerPricingOverride` for customer-specific multiplier/moq; fall back to `PricingProfile.defaultMultiplier` and company-level `priceMultiplier` where applicable.
- Resolution order:
  1) Customer override (curveOverrideId/multiplier/moqOverride)
  2) PricingProfile defaults
  3) Product defaults / company priceMultiplier

## 9) CMT matching & “easy new CMT” UX proposal
**Matching inputs**: Product.categoryId, subCategoryId, complexity (optional), customerId, qty.
**Matching output**: PricingProfile (or CMT Product) and a preview of effective unit price.

**Suggested UI flow**:
- From BOM/costing editor: “Find CMT” → runs resolver with product category/subcategory.
- If no profile exists: “Create CMT profile” button that pre-fills category/subcategory, curve template, and default multiplier.
- Save creates a PricingProfile + optional Product shell (costingMode=CURVE) for inventory-like compatibility.

## 10) Migration plan (incremental)
1) **Introduce costingMode/costingRefId** with defaults (FIXED) and no behavior change.
2) **Add PriceCurve/PriceTier/PricingProfile** and resolver module; use only for opt-in products.
3) **Snapshot resolved pricing** into Costing/InvoiceLine (new JSON field) at creation time; do not mutate existing records.
4) **Add CMT matching UI** as an optional helper, preserving legacy SKU flows.
5) **Backfill mapping** from legacy CMT SKUs to profiles only for new records; never rewrite existing invoice/costing snapshots.

## 11) Re-resolution behavior confirmation
- Invoices: no evidence of re-resolution after creation; invoice lines persist unitPrice and totals. (`app/routes/invoices.$id.tsx`, `app/modules/invoice/services/invoicing.ts`)
- Costings: can be refreshed from product/BOM, which can change future invoice suggestions but does not mutate existing invoices. (`costingRefreshProduct.server.ts`, `invoice/services/costing.ts`)

