# Prisma Schema Specification

This document outlines the schema conventions, key models, and decisions in `prisma/schema.prisma`, with emphasis on fields relevant to the importer and UI.

## Conventions

- Primary keys: Integers autoincrement unless specified (several FM-sourced tables map `a__Serial` directly to id).
- Metadata on most tables: `createdBy`, `modifiedBy`, `createdAt` (default now), `updatedAt` (@updatedAt). Importers respect/optionally set timestamps when present.
- Enums: `ProductType`, `CompanyType`, `UsageType`, `ColorScheme`.

## Highlights and decisions

- Product

  - `sku` unique; importer enforces uniqueness with de-duplication suffix when conflicts appear.
  - `variantSetId` optional; linked if the variant set exists.
  - Relations to `Company` (supplier/customer), and to `ValueList` for currency/tax/category.

- Company

  - Flags: `isCarrier`, `isCustomer`, `isSupplier`, `isInactive`, plus `isActive` convenience.

- ValueList

  - Generic list table with `type`, `code`, `label`, `value`.
  - Used for product currency, tax, category relations.
  - Invoices also reference `taxCode` via relation. Purchase Order Lines do not (see below).

- Shipment and ShipmentLine

  - `ShipmentLine.shipmentId` renamed from `shippingId` (importer writes `shipmentId`).
  - `ShipmentLine.qtyBreakdown` is an `Int[]`; importer parses from `Qty_Breakdown_List_c`.

- Purchase Orders and Lines

  - `PurchaseOrderLine.taxCode` is a STRING not a relation; `taxRate` numeric. This replaces the old `taxCodeId` relation to support flexible value lists.
  - `PurchaseOrder` has `companyId`, `consigneeCompanyId`, `locationId` relations.

- ProductMovement and ProductMovementLine

  - Movement mirrors FM foreign keys into scalar fields: `assemblyActivityId`, `assemblyId`, `costingId`, `expenseId`, `jobId`, `locationInId`, `locationOutId`, `shippingType`, `productId`, `quantity`, `purchaseOrderLineId`, `shippingLineId`, `notes`.
  - Lines include `movementId`, `productMovementId` (mirror), `productId`, `batchId`, `costingId`, `purchaseOrderLineId`, `quantity`, `notes`.
  - Importer auto-creates “regen” batches when a referenced `batchId` is missing for a product.
  - Stock qty computation (c_stockQty) now derives solely from `ProductMovement` rows (not lines). Transfers (`movementType='transfer'`) are ignored (net zero). We simply sum `quantity` for rows whose normalized movementType is in the IN set plus those in the OUT set (OUT remain negative if source data stored them as negative) and include any other non-transfer movement types as-is. When no qualifying movement rows exist, fallback is the sum of `Batch.quantity` for the product.
  - Batch breakdown (c_byBatch) aggregation uses `ProductMovementLine` rows: for a given product we LEFT JOIN all its `Batch` records to a CTE of movement lines for that product and group by batch. The query now just sums raw `pml.quantity` (no IN / OUT / transfer classification or ABS normalization). Batches with no movement lines appear with `qty=0`. This is intentionally simpler than overall stock computation which ignores lines.
  - Per-batch computed field `c_stockQty` (when batches are already loaded on a product) is derived via `computeBatchStockQty`, which still applies IN/OUT classification and (if no movement lines exist) falls back to the batch's own `quantity` column. In contrast, `computeProductByBatch` does not use that fallback and will report 0 for batches lacking movement lines. Therefore a batch's `c_stockQty` can differ from its entry in `c_byBatch` when only a static `Batch.quantity` exists or when IN/OUT normalization changes the signed total.
  - Location breakdown (c_byLocation) now derives solely from `ProductMovement` headers (not lines). For `movementType='transfer'` we add `ABS(quantity)` to `locationInId` and subtract `ABS(quantity)` from `locationOutId`. For all other movement types (including null/unknown) we add the stored signed `quantity` to each present location side (`locationInId` and/or `locationOutId`). This can diverge from older line-based logic; it's aligned with product stock which also ignores lines.
  - Note: Because non-transfer movements contribute their full signed quantity to both sides when both locations are present (rare), the sum of `c_byLocation.qty` across locations will generally not equal `c_stockQty` (and is not intended to). It represents per-location gross allocation, not a partition of stock. Transfers preserve net zero effect across the pair by adding and subtracting equal absolute quantities.

- Variant/VariantSet/Assembly/Activity/Costing

  - Arrays for breakdowns (`qtyBreakdown`), and optional relations across models for traceability.

- Expense/Invoice
  - `Invoice.taxCodeId` relates to `ValueList` (type Tax), with `taxRateCopy` stored on both invoice and line when provided by source.
  - `Expense` includes `shippingId` relation to `Shipment` for linking charges.

## Patterns for upserts and matching

- Prefer numeric ids when present (e.g., FM `a__Serial`, `a__ProductCode`).
- Products: resolve by numeric id or SKU; ensure `sku` uniqueness via rename suffix on conflict.
- Companies: upsert by id; fallback matching by `name` when id absent.
- Locations: update by `name` match or create.
- Movements/Lines: update or create when id present, otherwise create; validate referenced movement/product/batch.

## Indexes and constraints

- `Product.sku` unique.
- Helpful indexes exist for linkage (e.g., `@@index([productId])` on `ProductMovementLine`).
- Importers catch Prisma errors (P2002 uniqueness, P2003 FK) and push log entries; failures are log-only.

## Assumptions & extensions

- Value lists may be extended to composite `(type, code)` semantics later; import keeps string taxCode on POL to decouple.
- Regen batch strategy uses deterministic `codeSartor=REGEN-<productId>` to avoid duplicates and speed retries.
- Health checks via `scripts/check-import-health.js` provide feedback for data quality; additional repair scripts can be added as needed.
