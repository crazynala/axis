# Importer Specification

This document describes the Excel import architecture, modes, mappings, utilities, and operational practices for the Remix-based ERP importer.

## Overview

- Entry point: `app/routes/admin.import.server.ts` (server action). UI is in `app/routes/admin.import.tsx` and re-exports the action.
- Inputs: One or more `.xlsx` files. Optional `sheetName`. Mode can be explicit or inferred by filename.
- Output: Per-file batch summary including created/updated/skipped/errors.

## Mode ordering and inference

- Mode is either provided by the `mode` form field or inferred from the filename substring. See `inferMode()` in `admin.import.server.ts`.
- Files are ordered by `modePriority` to ensure referential integrity (e.g., Companies → Products → Movements → Movement Lines, etc.).

## Utilities

Located in `app/importers/utils.ts`:

- `normalizeKey`, `pick` — robust column lookup supporting different headers and separators.
- `asNum`, `asDate`, `asBool` — tolerant parsing for numbers, Excel dates, booleans.
- `parseIntListPreserveGaps`, `parseStringListPreserveGaps` — map list strings to arrays while preserving empty gaps.
- `processRowsInBatches` — optional batch processor for large files.

## Error handling and logging

- Each importer returns `{ created, updated, skipped, errors }` and pushes a batch result row.
- Errors are captured with index, key fields, and Prisma error metadata; failures are log-only.
- Server logs include start/end with totals per mode.
- Progress logging: Importers now emit a progress line every 100 processed rows (configurable per file edits) formatted as:
  `[import] <mode> progress <n>/<total> created=<c> skipped=<s> errors=<e>`
- Completion logging: Final summary emits `[import] <mode> complete total=<t> created=<c> skipped=<s> errors=<e>`.
- Consolidated error summary: Every importer prints a grouped summary line when any errors occurred:
  `[import] <mode> error summary [ { key, count, ids:[...] }, ... ]`
  - `key`: Constraint name (FK / unique) else Prisma `code` else `"error"`.
  - `count`: Number of failed rows in that group.
  - `ids`: Full list of row primary ids (or null) for direct reconciliation (no truncation).
    Per-row error logging is suppressed (except internally captured) to reduce noise; rely on this summary plus the returned `errors` array for detail.
    Invoice dedup: On unique (`P2002`) invoiceCode clashes the importer auto-appends `-dup`, `-dup2`, etc. before recording an error, ensuring maximal insertion.
- Error objects (per row) include: `index`, primary key `id` (when available), Prisma `code` (e.g., P2003 for FK violations), `constraint` (resolved from `meta.field_name` or `meta.target`), and full `message`.
- Foreign key (P2003) troubleshooting: The reported `constraint` indicates the relation field whose referenced parent row is missing. Example: `Batch_productId_fkey` means the `productId` on the batch points to a non-existent `Product.id`.

## Server/client split

- Client route (`admin.import.tsx`) is browser-safe and re-exports action from `admin.import.server.ts` to avoid bundling server-only modules into the client.

## Health check

- `scripts/check-import-health.js` provides counts and linkage checks (duplicate SKUs, missing FKs in product movement lines).

## Per-mode mappings (high level)

Below are the key fields handled per mode. Column names are matched loosely using `pick()` with multiple aliases.

### Companies (`import:companies`)

- Keys: `a__Serial` (id numeric), `Company|Name` (fallback)
- Fields: `name`, `email`, `phone`, flags (`Flag_Carrier|Customer|Supplier|Inactive`), `category`, `CustomerPricingCategory`, `CustomerPricingDiscount`, `OurRep`.
- Notes: Concatenated summary of type/category/pricing/rep/carrier.
- Metadata: `Record_CreatedBy`, `Record_ModifiedBy`, timestamps.
- Upsert: by id; fallback match on `name` when id missing.

### Locations (`import:locations`)

### Contacts (`import:contacts`)

- Keys: `a__Serial` (id)
- Fields: `addressId` (`a_AddressID_c`), `companyId` (`a_CompanyID`), `email`, `department`, `firstName` (`Name_First`), `lastName` (`Name_Last`), `title` (`Name_Title`), phones (`Phone|Direct`, `Phone|Home`, `Phone|Mobile`), `position`, `recordType` (Employee|Contact|Customer).
- Behavior: Upsert by id. Progress every 100 rows, final summary, structured errors.

### Addresses (`import:addresses`)

- Keys: `a__Serial` (id)
- Fields: `companyId` (`a__CompanyID`), `contactId` (`a__ContactID`), `addressCountry`, `addressCountyState`, `addressLine1/2/3`, `addressTownCity`, `addressZipPostCode` (column headers with underscores or combined tokens tolerated via `pick`).
- Behavior: Upsert by id. Referenced by Shipments (`addressIdShip`) and Contacts (`addressId`).

- Keys: `a__Serial|a_Serial|id`, `Location|Name`
- Fields: `name`, `notes`.
- Upsert: match by `name` if present.

### Products (`import:products`)

- Keys: numeric `a__ProductCode|a_ProductCode|ProductCode|a__Serial|a_Serial|product_id|id` (preferred id), `SKU` (unique with de-duplication suffix policy).
- Fields:
  - `id`: from `a__Serial|a_Serial|a__ProductCode|a_ProductCode|ProductCode|product_id|id`.
  - `sku`: from `SKU|sku|sku code` (deduped: `-dup`, `-dupN`).
  - `name`: from `name|product_name|item name|description`.
  - `type`: maps to enum (CMT/Fabric/Finished/Trim/Service).
  - `costPrice`: from `Price|price|Cost|cost|cost price|costprice|unit cost`.
  - `manualSalePrice`.
  - `defaultCostQty` optional; defaults to 60 when omitted.
  - Flags: `stockTrackingEnabled`, `batchTrackingEnabled`.
  - `supplierId`: from numeric `a_CompanyID` or by `Supplier` name match.
  - `purchaseTaxId`: resolved from string `purchaseTaxCode|DefaultTaxCodePurchase|purchaseTaxID` by matching ValueList where `type="Tax"` on `code` or `label` (case-insensitive) or numeric id.
  - `categoryId`: resolved from string `Category|category|categoryId` by matching ValueList where `type="Category"` on `code` or `label` (case-insensitive) or numeric id.
  - `variantSetId`: linked if the set id exists.
- Behavior: enforce SKU uniqueness; prefer numeric id for stable linkage.
- Progress: logs every 100 rows with counts (created/updated/skipped/renamedSku) and final summary including variant set and supplier linkage stats.

Notes on pricing:

- The `autoSalePrice` column was removed from the database. The UI now displays a computed `autoSellPrice` derived at read-time using Prisma extension helpers:
  - Prefer `manualSalePrice` when present.
  - Otherwise, compute cost for the effective quantity (defaults to `defaultCostQty`) using `ProductCostRange` for the product if available, else a supplier-wide `ProductCostGroup`/`ProductCostRange`, else fall back to `costPrice`.
  - Apply purchase tax to get `costWithTax` and use that as the auto sell price.
  - Import does not accept `autoSalePrice` anymore.

Related pricing models added:

- `ProductCostGroup` (supplier-scoped default cost settings; optional `currency`, `costPrice`, `sellPriceManual`).
- `ProductCostRange` (tiered pricing by `rangeFrom`/`rangeTo` bound to either a specific `productId` or a `costGroupId`). Exactly one of these linkages is required per row.

### Variant Sets (`import:variant_sets`)

- Keys: id or name.
- Fields: `name`, `variants` (string list → array).

### Shipments (`import:shipments`)

- Keys: `a__Serial` (id).
- Fields: companies (sender/receiver/carrier), address, location, dates, status, packing slip/tracking, type (In/Out).

### Shipment Lines (`import:shipment_lines`)

- Keys: `a__Serial` (id).
- Fields: `assemblyId`, `jobId`, `locationId`, `productId` (numeric), `shipmentId` (renamed from shippingId), `variantSetId`, `category`, `details`, `quantity`, `status`, `subCategory`, `qtyBreakdown` (parsed from `Qty_Breakdown_List_c`).
- Progress: logs every 100 rows and final summary.
- FK Errors: `ShipmentLine_productId_fkey` or `ShipmentLine_shipmentId_fkey` indicate missing parent Product/Shipment.

### Product Movements (`import:product_movements`)

- Keys: id optional; create or update by id when present.
- Resolve product by numeric ProductCode or SKU via prebuilt map.
- Fields: movement header with scalar mirrors for FM FKs: `assemblyActivityId`, `assemblyId`, `costingId`, `expenseId`, `jobId`, `locationInId`, `locationOutId`, `shippingType`, `productId`, `quantity`, `purchaseOrderLineId`, `shippingLineId`, `notes`, `date`, `movementType`.

### Product Movement Lines (`import:product_movement_lines`)

- Keys: `a__Serial` (line id) optional.
- Must resolve: `movementId` (required), `productId` from numeric ProductCode or SKU map.
- Fields: `movementId`, `productMovementId` (mirror), `productId`, `batchId` (validated), `costingId`, `purchaseOrderLineId`, `quantity`, `notes`, `createdAt`.
- Batch repair: if `batchId` FK is missing, auto-create a regen batch per product (`codeSartor=REGEN-<productId>`) and retry once.

### Invoices (`import:invoices`) and Invoice Lines (`import:invoice_lines`)

- Invoice: id, company, date, status, optional product copy fields, tax code relation (`taxCodeId`) and `taxRateCopy`.
- Invoice Line: id, costing/expense/invoice/job/product/PO line, shipping split ids (Actual/Duty), priceCost/priceSell, quantity, `taxCodeId`, `taxRateCopy`, `invoicedTotalManual`.
- Progress: both modes log every 100 rows and a final summary.
- FK Errors: `InvoiceLine_productId_fkey` / `InvoiceLine_invoiceId_fkey` / others show missing parent entities; ensure products and invoices imported first. Unique errors (`P2002`) for `invoiceCode` logged with constraint array.

### Purchase Orders (`import:purchase_orders`) and Lines (`import:purchase_order_lines`)

- PO: id, company, consignee, location, date.
- POL: id, purchaseOrderId, jobId, assemblyId, productId or copies, qtys and pricing; TAX FIELDS: `taxCode` as STRING (no relation), `taxRate` numeric. This replaces the prior `taxCodeId` relation.

### Batches (`import:product_batches`)

- Keys: id or (productId + codeSartor/mill/name) depending on data.
- Fields: product/location/job/assembly links, quantities, codes, receivedAt, notes.

### Product Locations (`import:product_locations`)

- Keys: product + location; quantities by location.

### DHL Report Lines (`import:dhl_report_lines`)

- Keys: Synthetic sequential id = row index (1-based) in the provided sheet; any `a__Serial` / `id` column values are ignored.
- Rationale: Source exports lacked stable numeric identifiers; using the row position guarantees deterministic re-import and allows updates (row N overwrites prior row N).
- Fields: Wide set of DHL billing columns (account, AWB data, weights, revenue/tax, origin/destination, dates) mapped verbatim as documented in code (`importDhlReportLines.ts`).
- Progress: Logs every 100 rows and on completion. Consolidated error summary groups constraint/code failures; missing id errors no longer occur because ids are synthesized.

### Jobs, Assemblies, Assembly Activities, Product Lines, Costings

- Standard numeric key mapping, dates, enums where applicable, arrays for breakdowns (e.g., activities `qtyBreakdown`).
- Progress: jobs, assembly_activities, and costings importers log every 100 rows and a final summary.
- Costings logging: Emits `[import] costings progress n/total created= updated= skipped= errors=` every 100 rows and a final `[import] costings complete ...` line plus grouped error summary (by Prisma `code`) when errors occur.
- FK Errors: `AssemblyActivity_assemblyId_fkey` indicates the referenced `Assembly.id` was not present at import time—verify assemblies imported first and IDs align. Rows with missing parent are logged but processing continues.

## Assumptions and edge cases

- Missing IDs: Some modes tolerate missing PKs and create records; others require id (e.g., line tables) and will skip+log.
- Name/SKU resolution: Products and companies prefer numeric IDs but fall back to names/SKUs where reasonable.
- Value Lists: Tax codes/category/currency stay as relations for invoices and products; POL uses string `taxCode`.
- Import is idempotent where practical: using upsert or update-by-id/name.
