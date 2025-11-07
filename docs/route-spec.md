# Axis – Route Field/Functionality Reference

Purpose: Record what each route shows and can do so we can spot regressions quickly during refactors.

Last updated: 2025-09-12

## Global UI and Behavior

Note on structure: domain components, form configs, and services now live under `app/modules/<domain>/...`. Keep filename-based routes under `app/routes/` and import from modules. Temporary re-export shims may exist under `app/services/*` during migration.

- AppShell header
  - Save/Cancel header (unsaved-changes UX)
  - Record navigation (Prev / Next + index/total) powered by `RecordContext` hybrid roster (legacy RecordBrowser widget removed)
    - Prev/Next computed from ordered `idList`; navigation swaps only the last `:id` segment
  - Global search (Cmd/Ctrl+K): searches Jobs and Products; navigates on click
- Providers
  - `GlobalFormProvider` at root
  - `RecordContext` (module roster + sparse row cache) replaces removed `RecordBrowserProvider`
  - Form field convention
    - Use Mantine input `label` prop; add `mod="data-autoSize"` for compact layout
    - Bind via RHF `register` or controlled props
    - Example: `<TextInput label="Name" mod="data-autoSize" {...form.register('name')} />`
    - CSS for `data-autoSize` tied to Mantine v8 DOM structure
- Decommissioned (2025‑09‑12): RecordBrowserProvider / useRecordBrowser / useMasterTable / RecordNavButtons / pagination-based hydration endpoints (e.g. `invoices.more`)
- Logging

  - Client logger with module levels from `window.__LOG_LEVELS__`
  - Server pino; warn/error beacons to `/log`
  - Admin persists levels via Prisma `SavedView` (module=log, name=levels)

### Hybrid Roster + Windowed Hydration Pattern (Implemented Across Major Modules)

- Purpose: Replace classic page/perPage pagination with a high‑performance, stable navigation model that supports:
  - Fast prev/next (record browser) across very large result sets (tens of thousands) without loading every row
  - Seamless infinite scroll (virtual style) while preserving a canonical ordering
  - Stable selection retention when moving between index and detail routes
  - Cheap re-query of filtered ID roster while reusing previously hydrated row objects
- Core Data Structures (RecordContext):
  - `module`: current logical module key (e.g. `invoices`, `products`)
  - `idList`: ordered array of numeric IDs (capped; current cap ~50k) representing the full result roster for active filters/search/sort
  - `idIndexMap`: Map<number, index> for O(1) navigation and inclusion checks
  - `rowsMap`: Sparse cache `{ id -> hydratedRow }` populated on demand via batch hydration endpoint
  - `currentId`: the active (selected) record id (persisted across navigation)
- Window Manager (`useHybridWindow`):
  - Maintains a sliding window (`start`, `endExclusive`) into `idList` sized to cover viewport + overscan
  - Derives `missingIds` (in-window IDs not yet hydrated) and batches fetches to `/module/rows?ids=...`
  - Distinguishes `fetching` (network in flight) from `loading` (initial roster not yet ready)
  - Tracks “orphans” (requested IDs still missing after 2 fetch attempts) to avoid spinner lock
  - Supports imperative expansion to ensure the selected record is within the active window (selection inclusion loop)
- Scroll & Selection Behavior:
  - Auto-scroll only when `currentId` changes (prevents jank when window expands for other reasons)
  - On index mount, if selection lies outside current window, widen window progressively until included (bounded)
  - Pending scroll retry: if the target row DOM not yet present (hydration lag) schedule a short retry sequence
- Batch Hydration Endpoints:
  - Pattern: `/<module>/rows?ids=1,2,3` returns minimal row objects needed for index table
  - Server may return a subset (e.g., filtered out or missing) – client tolerates sparsity
- Roster Refresh (filters/search changes):
  - Layout loader recomputes ID roster + initialRow slice (first window) and calls `setIdList` (module aware; resets state when module key changes)
  - Existing cached rows reused if still relevant
- Record Navigation Integration:
  - Detail routes set `currentId` on mount (persist selection across index/detail transitions)
  - Prev/Next + keyboard shortcuts (Cmd/Ctrl + ← / →) derived from `idList` & `idIndexMap`
  - Position shows `currentIndex + 1 / idList.length`
  - Window expands (if needed) before scroll to hydrate selected record
- Extensibility Guidelines:

  - Provide layout route loader that returns: `{ idList, initialRows, total, ...filterMeta }`
  - Implement `rows` resource route for batch hydration
  - Index route uses `useHybridWindow` + `NavDataTable` (formerly `RefactoredNavDataTable`)
  - Detail route sets `currentId` on mount; does NOT clear it on unmount

- Auth screens (no AppShell)
  - The `/login` route renders without the main AppShell/nav. Root checks `location.pathname === "/login"` and renders `<Outlet />` directly.

### Findify (Global Find/Edit Mode Toggle)

- Purpose: Enable per-detail-route ad‑hoc searching ("find mode") without leaving the record context.
- State Provider: `FindProvider` supplies `{ mode: 'edit' | 'find', setMode }`.
- Toggle Component: `FindToggle` switches modes and exposes an `onSearch()` callback (executes criteria submission) and `beforeEnterFind()` guard (prevents losing unsaved edits).
- Two-Form Pattern:
  - Edit Mode: Normal RHF form bound to persisted record fields; integrated with `GlobalFormProvider` for global Save/Cancel and dirty tracking.
  - Find Mode: Separate RHF form with blank (undefined/empty) defaults for all searchable criteria; not registered with global Save/Cancel.
- Mode Gating: Entering find mode is blocked if the edit form is dirty (user must Save or Discard first).
- Auto Exit: After a successful search submission (navigation completes), detail routes auto-switch back to `edit` so real panels (stock, movements, etc.) reappear while the record cursor reflects filtered results.
- Criteria Submission: Posts `_intent=find` with only non-empty fields; server responds by updating the master list (record browser cursor) and reloading the current detail (or first match) while edit mode resumes.
- ID Handling: In edit mode ID is read-only; in find mode ID becomes an editable criteria field (exact match).
- Remount Strategy: Form subtree keyed by mode (`key={"mode-"+mode}`) so RHF applies the correct default set when toggling.
- Custom Widgets: Shared widgets (`TextAny`, `TriBool`, `NumberMaybeRange`) adapt: TriBool shows segmented Any/Yes/No in find mode, single switch in edit mode.
- Visibility Rules: Data-heavy panels (BOM, Stock, Movements) render only in edit mode; find mode shows criteria-only cards to avoid visual noise and stale data confusion.
- Extensibility: Additional modules can opt-in by wrapping their detail route in `FindProvider`, implementing dual RHF forms, and gating entry with dirty check—no global changes required.
- Global Visual Indicator: While in `find` mode the root `<html>` gets `data-find-mode` causing a subtle blue inner glow + background tint across the main content region; clears automatically on unmount/exit and respects reduced-motion.

### Navigation (from `app/root.tsx`)

- Top navigation items:
  - Contacts → `/contacts`
  - Companies → `/companies`
  - Products → `/products`
  - Costings → `/costings`
  - Jobs → `/jobs`
  - Assembly → `/assembly`
  - Assembly Activities → `/assembly-activities`
- Bottom navigation items:
  - Admin → `/admin`
  - Settings → `/settings`

---

## Admin (`/admin`)

- Layout

  - Dedicated Admin sidebar and content area using a nested AppShell at `app/routes/admin.tsx`.
  - This nested AppShell visually overrides the root AppShell header/nav within the Admin section (details below).

- Navigation entries (children routes)

  - Import: `/admin/import` – Excel import tools
  - Logging: `/admin/logging` – per-module log levels with persistence
  - Value Lists: `/admin/value-lists/:listType` – list types include `Tax`, `Category`, `Subcategory`
  - Forex: `/admin/forex/:fromCurrency/:toCurrency` – default link points to `/admin/forex/USD/TRY`
  - DHL Records: `/admin/dhl-records` (list) and `/admin/dhl-records/:id` (detail)

- Redirects (legacy → admin)

  - `/forex` → `/admin/forex/USD/TRY`
  - `/dhl-records` → `/admin/dhl-records`
  - `/dhl-records/:id` → `/admin/dhl-records/:id`

- Logging Settings

  - Per-module level dropdowns: silent, error, warn, info, debug, trace
  - Save persists and updates client levels without reload

- Value Lists

  - Dynamic by `:listType` param (Tax, Category, Subcategory)
  - Create/Delete entries; upload from Excel (where enabled)

- Imports (Excel)
  - Product Movements
    - Maps core fields: Type, Date, Quantity, Movement_From (a_LocationID_Out), Movement_To (a_LocationID_In), ShippingType
    - Product resolution: numeric Product.id OR SKU (case-insensitive)
    - Direction: uses provided From/To as locationOutId/locationInId (no inference)
    - Also maps FileMaker linkage IDs on header rows
      - a_AssemblyActivityID → ProductMovement.assemblyActivityId
      - a_AssemblyID → ProductMovement.assemblyId
      - a_CostingsID → ProductMovement.costingId
  - Product Movement Lines
    - Maps: a_ProductMovementID (FK), a_ProductCode (numeric id or SKU), Quantity, Date, a_AssemblyLineID (costing), a_BatchID, a_PurchaseOrderLineID
    - If referenced Batch.id is missing, auto-creates a per-product Regen batch (codeSartor = REGEN-<productId>) and reuses it
    - Pre-scans to align Batch id sequence to avoid collisions under concurrency
    - Ignores line-level MovementType; relies on the header’s movementType where needed

---

## Contacts (`/contacts`)

- Index
  - Columns: ID, Name, Company (exact set may expand)
  - Search/Filters: name (insensitive), company (TBD)
  - Sort: default ID asc
  - Pagination: per user preference
  - Actions: navigate to detail; header Record Browser navigates across visible IDs
- Detail (`/contacts/:id`)
  - Fields: ID, Name, Email/Phone (TBD), Company
  - Actions: edit/save (if implemented)

---

## Companies (`/companies`)

- Layout (`app/modules/company/routes/companies.tsx`)
  - Parent loader builds full filtered ID roster + initial window slice (first ~100 rows) with advanced multi-find support and saved view application.
  - Hydrates `RecordContext` with `idList` + `initialRows`; renders only `<Outlet />` (find manager now lives in index route).
  - Prevents revalidation on child/detail navigation and non-GET mutations via `shouldRevalidate` factory with watch keys.
- Index (`app/modules/company/routes/companies._index.tsx`)
  - Renders `CompanyFindManagerNew` + breadcrumb using `appendHref` from session find state (persisted search filters).
  - Uses `useHybridWindow` over context `idList`; no longer calls `useRouteLoaderData` or sets `idList` manually.
  - Infinite scroll hydration; auto-expansion loop ensures selected company row is in window.
  - Columns: ID, Name, Carrier, Customer, Supplier, Active, Notes.
  - Sorting controlled via URL `sort` + `dir` params (default id asc).
  - Saved views ribbon simplified (currently blank) – view persistence still available via parent loader/action.
- Detail (`/companies/:id`)
  - Sets `currentId` on mount; uses Record Browser for prev/next across filtered roster.
  - Fields: ID, Name, Notes + flags (Carrier/Customer/Supplier/Inactive) (extensible).

---

## Products (`/products`)

- Layout (`app/routes/products.tsx`)
  - Hybrid loader: returns `{ idList, initialRows, total, filterMeta }` – full ordered ID roster (capped) + first hydrated slice
  - Registers roster with `RecordContext` (`module = products`); resets prior module state when switching
  - Recomputes on filter/search/sort changes (deterministic ordering)
- Index (`app/routes/products._index.tsx`)
  - Hybrid infinite scroll window over `idList` (replaces page/perPage)
  - Query params still express search (name, sku, type) and filters; roster loader reads them
  - Filters:
    - sku: contains (insensitive)
    - name: contains (insensitive)
    - type: equals
    - stock: `stockTrackingEnabled` (bool)
    - batch: `batchTrackingEnabled` (bool)
    - minCost: `costPrice >=`
    - maxCost: `costPrice <=`
  - Saved Views: persist filters/search + (future) advanced multi-request blob
  - Batch hydration endpoint `/products/rows?ids=...` supplies sparse rows
  - Ensures selected product is in-window (expands window before scroll) and auto-scrolls only on selection change
  - Columns (baseline): ID, SKU, Name (+ extensible extras)
  - Keyboard nav: ↑ ↓ PageUp PageDown Home End; active row highlighted
  - Actions: navigate to detail; apply filters/sorts/search; choose saved view
  - Record Browser: traverses full roster (`idList`), not just hydrated slice
- Detail (`/products/:id`)
  - Sets `currentId` on mount (persists selection when index remounts)
  - Fields: ID, SKU, Name (others may include type/stock flags/costs)
  - Actions: edit/save (if implemented)
  - Stock by Batch
    - Filters:
      - Scope switch: All | Current (Current hides zero-qty batches)
      - Location SegmentedControl: All | <location names>
  - Batch rows show location, batch code/name, and quantity (available qty computed server-side consistent with Products → Stock view)
  - Stock panels
    - By Location: aggregated totals per location
    - By Batch: filters
      - Scope: SegmentedControl [All | Current]; Current hides zero-qty batches
      - Location: SegmentedControl [All | each location name present in data]
      - Table columns: Batch Codes, Name, Location, Received, Qty
  - Product Movements
    - Right of Stock panel on desktop (stacks on mobile)
    - Toggle: SegmentedControl [Movement | Line]
      - Movement view: latest 500 ProductMovement headers for this product
        - Columns: Date, Type, Out, In, Qty, Notes
        - Out/In show location names when available (fallback to id)
        - Transfers (Type "Transfer") display both Out and In when both ids are present
      - Line view: latest 500 ProductMovementLine rows for this product
        - Columns: Date, Type, Out, In, Batch, Qty, Notes
        - Batch shows `codeMill | codeSartor` when present; falls back to `batchId`
  - Tax Codes
    - Reusable TaxCodeSelect component (`app/components/TaxCodeSelect.tsx`)
    - Used on Product detail to pick `purchaseTaxId` from `ValueList` where `type = 'Tax'`
  - Findify Implementation
    - Dual RHF forms: `editForm` (record defaults) + `findForm` (blank criteria)
    - Guard prevents entering find if `editForm` is dirty; user must save/discard first
    - ID field becomes criteria input in find mode (exact match); read-only otherwise
    - `_intent=find` submission builds a FormData with only non-empty criteria (including ranges: costPriceMin/Max, manualSalePriceMin/Max, componentChild\* fields, tri-bool stock/batch tracking where specified)
    - Auto exit back to edit mode after navigation completes to show real data panels with the filtered record cursor
    - BOM / Stock / Movement panels hidden in find mode; replaced with a BOM criteria card for component child filters
    - Keyed subtree (`key=mode-*`) forces RHF remount on mode change ensuring blank form appears instantly
    - Shared widgets adapt presentation (e.g., TriBool segmented Any/Yes/No vs Switch)

### Inventory computation rules (server)

- By Location (used in product detail and debug tools)
  - Transfers: +ABS(quantity) to locationInId; -ABS(quantity) from locationOutId
  - Non-transfers: add signed quantity to locationInId; subtract signed quantity from locationOutId
  - Movements with both locations null are ignored in totals
- Totals by Product (fallback aware)
  - If any ProductMovementLine exists for the product: total = sum(IN types ABS(line.qty)) - sum(OUT types ABS(line.qty)) + sum(unknown types signed line.qty)
  - Else fallback to sum of `Batch.quantity`
  - Same rule applies per-batch when computing batch stock
- Movement type classification
  - IN types: in, receive, purchase, adjust_in, return_in, return, transfer_in, transfer, po (receive), shipping (in)
  - OUT types: out, issue, consume, ship, sale, deliver, adjust_out, transfer_out, transfer, shipping (out), po (return), assembly, expense
- Debugger alignment
  - `debugProductByLocation` shows contributions using the same rules above
  - Negative non-transfer movements (e.g., Amendment with quantity -66.3) remain negative on the inbound contribution and subtract on the outbound side

---

## Costings (`/costings`)

- Index
  - Columns: ID, Component, Usage, Qty/Unit, Unit Cost
  - Actions: navigate to related product/assembly (where linked)

## Invoices (`/invoices`)

- Layout
  - Hybrid loader returns `{ idList, initialRows, total, filterMeta }` and seeds `RecordContext` (`module = invoices`)
- Index (Hybrid Infinite Scroll)
  - Columns: ID, Code, Date, Company, Amount, Status
  - Company shows related company name when present
  - Amount = sum(priceSell × qty) across lines per invoice
  - Infinite window over full ordered `idList` (classic pagination removed)
  - Batch hydration via `/invoices/rows?ids=...` (sparse; tolerant of omissions)
  - Auto-expands window to include selected invoice and scrolls only on selection change
  - Orphan detection prevents spinner lock; separates `fetching` from overall `loading`
  - Keyboard nav + active row highlight matching Products implementation
- Detail
  - Sets `currentId` on mount (stable across navigation)
  - Editable: code, date, status, notes, customer (CompanySelect filter=customer)
  - Lines table: product, qty, cost, sell; totals row (Qty, Total Cost, Total Sell)
  - Record Browser uses roster ordering (prev/next not limited by hydration)

## Shipments (`/shipments`)

- Layout (`app/routes/shipments.tsx`)
  - Parent loader (migrating toward unified pattern) will host filtering logic (currently transitioning from index loader). Hydrates `RecordContext` with roster & initial rows; renders only `<Outlet />` after modernization.
- Index (`app/routes/shipments._index.tsx`)
  - Renders `ShipmentFindManager`, breadcrumb with `appendHref`, and virtualized table using `useHybridWindow` + context roster (no direct `useLoaderData` hydration).
  - Simplified header (no separate saved views component; unify with product/purchase order style). Filter clear button remains.
  - Columns: ID, Date, Type, Ship Type, Status, Tracking, From (sender name), To (receiver name).
  - Infinite scroll replaces legacy page/perPage pagination (URL params retained only for sort & potential legacy compatibility).
  - Auto-selection and window inclusion logic can be added similar to products (pending enhancement).
- Detail (`/shipments/:id`)
  - Uses Record Browser for prev/next over full filtered roster.
  - Editable core fields: date, dateReceived, type, status, tracking, packingSlipCode.
  - Sender/Receiver/company/location names displayed; lines table includes product, qty, related job/location/status.

## Expenses (`/expenses`)

- Layout: provides master list
- Index: columns ID, Date, Category, Details, Cost
- Detail: editable fields date, category, details, memo, priceCost, priceSell

## DHL Records (`/dhl-records`)

- Layout: provides master list
- Index: columns ID, Date, Invoice, AWB, Dest, Revenue EUR
- Detail: read-only view with key DHL fields (invoice, dates, AWB, revenue, origin/destination)

## Forex (`/forex`)

- Index-only: columns Date, From, To, Rate
- No detail route

### Admin Forex (`/admin/forex/:from/:to`)

- Index-only for a specific pair: columns Date, From, To, Rate
- Default link uses USD→TRY

## Purchase Orders (`/purchase-orders`)

- Layout: provides master list
- Index
  - Columns: ID, Date, Vendor, Consignee, Location, Total Cost
  - Vendor/Consignee/Location resolve via relations; fallback to id→name lookup when relations are absent
  - Total Cost = sum(priceCost × qty) across lines for each PO
  - Pagination and per-page dropdown wired to URL
- Detail
  - Editable: date, status
  - Read-only: vendor/consignee/location names (fallbacks shown when relations missing)
  - Lines table: product, qty ordered/current, shipped, received, cost, sell; totals row (Qty Ordered, Qty, Total Cost, Total Sell)
  - Add Line: opens a modal with Product picker + Qty Ordered; posts `_intent=line.add`
  - Record Browser: prev/next across current PO list

### Import mapping

- Purchase_Orders
  - a\_\_Serial → id
  - a\_\_CompanyID → companyId (vendor)
  - a\_\_CompanyID|Consignee → consigneeCompanyId
  - a\_\_LocationID|In → locationId (fallback: LocationID)
  - Date → date
  - Record_CreatedBy/Record_CreatedTimestamp → createdBy/createdAt
  - Record_ModifiedBy/Record_ModifiedTimestamp → modifiedBy/updatedAt
- Purchase_Order_Lines
  - a\_\_Serial → id
  - a\_\_PurchaseOrderID → purchaseOrderId
  - a\_\_JobNo → jobId
  - a_ProductCode/ProductCode → productId (numeric id or by SKU lookup)
  - ProductSKU → productSkuCopy
  - ProductName → productNameCopy
  - Price|Cost → priceCost
  - Price|Sell → priceSell
  - QtyShipped → qtyShipped
  - QtyReceived → qtyReceived
  - Quantity → quantity (current)
  - QuantityOrdered → quantityOrdered (original)
  - TaxCode → taxCode (string; maps to ValueList by type+code downstream)
  - TaxRate → taxRate

### Additional Import mappings

- Shipment (import:shipments)

  - a_AddressID|Ship → addressIdShip
  - a_CompanyID_Carrier → companyIdCarrier
  - a_CompanyID_Receiver → companyIdReceiver
  - a_CompanyID_Sender → companyIdSender
  - a_LocationID → locationId
  - a_ContactID_Receiver → contactIdReceiver

- Shipment Line (import:shipment_lines)

  - a_AssemblyID → assemblyId
  - a_JobNo → jobId
  - a_LocationID → locationId
  - a_ShippingID → shipmentId
  - a_VariantSetID → variantSetId

- Invoice Line (import:invoice_lines)

  - Price|Cost → priceCost
  - Price|Sell → priceSell
  - TaxCode|Cost → taxCodeId
  - TaxRate|Cost → taxRateCopy

- Invoice (import:invoices)
  - Code → invoiceCode
  - ProductSKU → productSkuCopy
  - ProductName → productNameCopy
  - Price|Cost → priceCost
  - Price|Sell → priceSell
  - TaxCode → taxCodeId
  - TaxRate → taxRateCopy

## Jobs (`/jobs`)

- Index
  - Columns: ID, Name/Project Code (TBD), Status
  - Search/Filters: name/code
  - Actions: navigate to job detail; record browser integration
- Job Detail (`/jobs/:jobId`)
  - Top Left card
    - Not editable: id
    - Editable: projectCode, name, customer (company picker)
    - Field labels: use Mantine input `label` prop
  - Top Right card
  - Editable: customerOrderDate, targetDate, dropDeadDate, startDate, endDate,
    jobType, status, type, endCustomerName, customerPoNum (new schema field)
    - Field labels: use Mantine input `label` prop (DatePickerInput, TextInput)
  - Forms
    - React Hook Form (RHF) + `useInitGlobalFormContext` wired to the global `SaveCancelHeader`
    - Save/Cancel triggered from the header (and Cmd/Ctrl+S); no inline Save buttons
    - Date fields use Mantine `DateInput` via RHF `Controller` (no hidden inputs)
  - Removed from Job detail: variant and assemblyActivities (handled under Job → Assembly)
  - Actions: Save updates the above fields via action `_intent=job.update`; navigate to assemblies
- Assemblies under Job
  - Canonical path: `/jobs/:jobId/assembly/:assemblyId`
  - Breadcrumbs: Jobs → Job :id → Assembly :id
  - Record Browser: prev/next among assemblies for the job
  - Keyboard shortcuts: prev/next, save (via timber)

### Assembly Detail (`/jobs/:jobId/assembly/:assemblyId`)

- Assembly panel
  - Fields: ID, Name, Job, Status
- Quantities panel
  - Dynamic columns from variant set (assembly or product fallback)
  - Rows: Ordered, Cut, Make, Pack; totals shown where available
- Costings panel
  - Columns: ID (product id, external link), SKU, Name, Usage, Qty/Unit, Required, Loc Stock, All Stock, Used, Unit Cost
    - ID column links to `/products/:id` using the ExternalLink widget
    - Required = (Ordered - Cut) × Qty/Unit
    - Loc Stock = stock of the component at the job's location; All Stock = global stock
    - Used = quantity consumed across activities for this assembly
  - Actions:
    - Add costing (modal): search products, Quantity Per Unit, Unit Cost, Usage Type (cut/make)
      - Action intent: `costing.create`
    - Delete costing: `costing.delete`
- Activity History panel
  - Columns: ID, Name, Job, End, Variant qty columns, Notes
  - Row click opens activity modal for editing (date, breakdown, batch consumption)
  - Actions: delete activity: `activity.delete`
- Form actions
  - Update assembly fields (name, status): `assembly.update`
  - Cut activity creation:
    - "Cut" button opens a modal (reusable component) with:
      - RHF-managed form: required project-wide
      - Date field
      - Quantity breakdown
        - Columns respect `c_numVariants` if present, else trimmed variant set length
        - Defaults to "left to cut" per variant from server extension if available; otherwise `ordered - already cut`
      - Material consumption section
        - Accordion per costing. Header: product link `#id [sku] name`; right: `consumed / expected`
        - Batches: lazy-loaded on panel open; clicking Available fills Consume
        - Filters:
          - Scope: All | Current (default Current)
          - Location: All | Job location (defaults to the job's location; label shows actual location name)
        - Inputs are compact (unstyled) full-cell fields
        - Cannot consume more than the available stock for a given batch (client-side clamp)
        - Batch available quantities computed server-side for consistency and performance
    - On save, creates an AssemblyActivity (type cut) and ProductMovement + ProductMovementLine rows:
      - One ProductMovement per batch location consumed
      - movementType = "Assembly"
      - locationOutId = the location of the consumed batches (for that group)
      - productId = the costing's component product id (fallback to batch's product)
      - quantity = total consumed across that location group (sum of positive entered amounts)
      - Each ProductMovementLine:
        - productMovementId set to the created header movement id
        - quantity stored as negative to represent consumption

---

## Assembly Activities (`/assembly-activities`)

- Index
  - Columns: ID, Name, Job, End, Variant columns (TBD), Notes
  - Actions: navigate to related job/assembly

---

## Record Navigation – Route Expectations (Hybrid Roster)

- Detail routes end in an ID segment so navigation swaps only the last path segment
- Layout loader returns `{ idList, initialRows, total }` and seeds `RecordContext` (module change resets prior module state)
- Detail routes call `setCurrentId(id)` (effect) and do not clear on unmount
- Keyboard shortcuts (Cmd/Ctrl + ← / →) implemented per detail route for prev/next
- Batch hydration endpoint (`/module/rows`) supplies sparse rows for window expansion

---

## Guardrails Checklist (per route)

- [ ] Renders content within AppShell and shows on navigation
- [ ] List/index implements search, sort, pagination (if relevant)
- [ ] Filters wired per route’s mapping
- [ ] Hybrid roster `idList` updates on filter/search/sort changes; navigation reflects new ordering
- [ ] Detail pages render expected fields
- [ ] Actions (create/update/delete) post the correct intents
- [ ] Saved Views (if supported) work end-to-end
- [ ] Admin logging changes reflect immediately (`window.__LOG_LEVELS__`)

---

## Maintenance Notes

- Avoid Router hooks inside provider singletons; pass navigate/location via props if needed.
- Keep canonical route shapes consistent with record browser assumptions.
- When changing fields/columns/behaviors, update this doc in the same PR.
- IDs display: do not prefix with `#` in the UI.

---

## Notes on AppShell nesting (Root vs Admin)

- Root (`app/root.tsx`) wraps most pages in a top-level AppShell (header + left nav). It conditionally skips the AppShell for `/login`, rendering the route’s `<Outlet />` directly.
- Admin (`app/routes/admin.tsx`) is a layout route that renders its own Mantine AppShell (sidebar + content). Because it’s nested, the Admin layout’s visual chrome replaces the root chrome for its children. Practically:
  - Root renders `<AppShell.Main><Outlet /></AppShell.Main>`; the child route (`/admin`) renders another AppShell inside that area, effectively becoming the visible frame.
  - Admin sets `header={{ height: 0 }}` and provides its own sidebar; this makes the Admin area look distinct without duplicating headers.
  - Record Browser still works because the Admin layout provides the master list (via `MasterTableProvider`) where needed.
