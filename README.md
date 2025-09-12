---
title: Server Rendering
toc: false
---

# ERP Remix

Run dev:

```
npm run dev
```

Build:

```
npm run build
```

## Import mappings

The Admin → Import supports Excel files with FileMaker field names. The following mappings are implemented:

- Invoices (import:invoices)

  - a_CompanyID → Invoice.companyId
  - InvoiceNo/InvoiceCode → Invoice.invoiceCode
  - Date → Invoice.date

- Invoice Lines (import:invoice_lines)

  - a_CostingID → InvoiceLine.costingId
  - a_ExpenseID → InvoiceLine.expenseId
  - a_InvoiceID → InvoiceLine.invoiceId
  - a_JobNo → InvoiceLine.jobId
  - a_PurchaseOrderLineID → InvoiceLine.purchaseOrderLineId
  - a_ShippingID|Actual → InvoiceLine.shippingIdActual
  - a_ShippingID|Duty → InvoiceLine.shippingIdDuty
  - a_TaxCodeID → InvoiceLine.taxCodeId
  - Plus common fields: Details, Category, SubCategory, PriceCost, PriceSell, Quantity, TaxRateCost, InvoicedTotalManual

- Purchase Orders (import:purchase_orders)

  - a_CompanyID → PurchaseOrder.companyId
  - a_CompanyID|Consignee → PurchaseOrder.consigneeCompanyId
  - a_LocationID|In → PurchaseOrder.locationId
  - Date → PurchaseOrder.date

- Purchase Order Lines (import:purchase_order_lines)
  - a_AssemblyID → PurchaseOrderLine.assemblyId
  - a_JobNo → PurchaseOrderLine.jobId
  - a_PurchaseOrderID → PurchaseOrderLine.purchaseOrderId
  - TaxCode → PurchaseOrderLine.taxCode (string)
  - Plus common fields: product id/sku, priceCost, priceSell, qtyShipped, qtyReceived, quantity, quantityOrdered, taxRate

IDs are treated as FileMaker serials (a\_\_Serial) when present and upserted.

## Find Architecture (Overview)

Unified, FileMaker‑style find system:

- Global hotkey triggers context-registered callback (FindContext + FindManagers).
- Shared DetailForm components (e.g., `JobDetailForm`, `ProductDetailForm`) render edit & find modes via FieldConfig metadata.
- Simple queries: individual URL params (e.g., `sku=ABC`).
- Multi-request (advanced) queries: base64 JSON stack in `findReqs` enabling (A OR B) minus (C) semantics using omit flag.
- Saved Views (extension) store both simple params and `findReqs`.

See `docs/find-pattern.md` for complete details.

## 2025-09 Hybrid Roster & Navigation Migration

The legacy RecordBrowserProvider + pagination model has been replaced with a unified hybrid roster + windowed hydration pattern powered by `RecordContext` and `useHybridWindow`.

Key changes:

- Layout routes now return `{ idList, initialRows, total }` and seed `RecordContext` (module scoped)
- Index pages render an infinite (windowed) list over the full ordered `idList`, hydrating only the visible window via a `/module/rows?ids=...` batch endpoint
- Detail routes call `setCurrentId(id)` on mount; Prev/Next (and Cmd/Ctrl + ←/→) use `idList` for O(1) navigation
- Selection persists while switching between index and detail; window expands on demand to hydrate the active record row
- Removed: `RecordBrowserProvider`, `useRecordBrowser`, `useMasterTable`, `RecordNavButtons`, pagination endpoints like `invoices.more`

Benefits:

- Stable, fast navigation across very large result sets (tens of thousands of IDs) without loading every row
- Smooth infinite scroll with deterministic ordering
- Reuse of previously hydrated rows when filters/search change
- Simplified mental model (one roster + sparse cache) vs per-page slices

### Adding a New Module (Checklist)

1. Create layout route `app/routes/<module>.tsx` with loader:

- Compute ordered `idList` (cap if necessary)
- Hydrate initial slice (first window) as `initialRows`
- Return `{ idList, initialRows, total }`
- In component, call `recordContextApi.resetForModule('<module>', { idList, initialRows })`

2. Implement batch hydration route `app/routes/<module>.rows.tsx` accepting `ids` query param; return minimal row objects keyed by id
3. Index route (`<module>._index.tsx`):

- Use `useHybridWindow({ idList, initialRows, fetchRows })`
- Render table/virtual list with rows from `windowRows`
- On row click navigate to `/<module>/:id`

4. Detail route (`<module>.$id.tsx`):

- Loader fetches full record
- Component: `useEffect(() => setCurrentId(id), [id])`
- Implement Prev/Next via `getPrevId(id)` / `getNextId(id)` from context and keyboard shortcuts

5. (Optional) Integrate Find pattern if module supports advanced querying (see `docs/find-pattern.md`)
6. Update docs (`docs/route-spec.md`) with fields / behaviors

### Navigation Utilities

`RecordContext` exposes:

- `idList`, `idIndexMap`, `rowsMap`
- `currentId`, `setCurrentId`
- `getPrevId(id)`, `getNextId(id)` (null when at ends)
- `mergeRows(newRows)` to add/refresh hydrated rows

### 2025-09 UI Consolidation

- `RefactoredNavDataTable` renamed to `NavDataTable`; arrow/home/end key handling removed from the component (now owned globally by `RecordContext`).
- Global record navigation toolbar uses Mantine `ActionIcon` buttons: First, Previous, Position, Next, Last.
- Position display uses tabular numerals and fixed width (e.g., `12 / 4,582`) and no longer shows the module label to reduce horizontal space.
- Enter/Space (or double click) still activate the selected row within the table.

### Minimal Batch Rows Contract

Request: `GET /<module>/rows?ids=1,2,3`

Response JSON: `{ rows: Array<RowSubset> }` where each row contains the columns required for the index list (avoid large relational graphs).

Missing IDs (filtered out, deleted) can simply be omitted; client tolerates sparsity.
