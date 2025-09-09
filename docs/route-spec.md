# Axis – Route Field/Functionality Reference

Purpose: Record what each route shows and can do so we can spot regressions quickly during refactors.

Last updated: 2025-09-08

## Global UI and Behavior

- AppShell header
  - Save/Cancel header (unsaved-changes UX)
  - Record Browser widget: first/prev/next/last + index/total
    - Builds target by replacing the last path segment with the new id
    - Expects canonical detail routes ending in an `:id` segment
  - Global search (Cmd/Ctrl+K): searches Jobs and Products; navigates on click
- Providers
  - `GlobalFormProvider` at root
  - `RecordBrowserProvider` at root; routes push their lists on mount
  - Optional priority gating to avoid list flip-flop when multiple routes update
  - Form field convention
    - Use Mantine input `label` prop (no separate `<Text>` labels/wrappers unless layout demands it)
    - Add `mod="data-autoSize"` to inputs so labels align and inputs expand to full width in our compact cards
    - Pair with RHF `register` or controlled `value/onChange`
    - Example
      - Text: `<TextInput label="Name" mod="data-autoSize" {...form.register('name')} />`
      - Number: `<NumberInput label="Unit Cost" mod="data-autoSize" value={v} onChange={setV} />`
    - Note: The CSS that implements `data-autoSize` relies on Mantine's DOM structure: wrapper > label + input. Keep Mantine at v8 and avoid overriding that structure in custom components.
  - RecordNavButtons usage:
    - Always derive `recordBrowser` like:
      - `const { records: masterRecords } = useMasterTable()`
      - `const recordBrowser = useRecordBrowser(currentId, masterRecords)`
    - Do not call `useRecordBrowser(currentId)` without the `masterRecords` list; the list comes from the surrounding layout route that provides the master table
- Logging
  - Client logger with module levels from `window.__LOG_LEVELS__`
  - Server pino; warn/error beacons to `/log`
  - Admin persists levels via Prisma `SavedView` (module=log, name=levels)

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

- Logging Settings
  - Per-module level dropdowns: silent, error, warn, info, debug, trace
  - Save persists and updates client levels without reload
- Value Lists (where enabled)
  - Create/Delete list
  - Upload from Excel
  - Imports
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

- Index
  - Columns: ID, Name (TBD: type/status)
  - Search: name (insensitive)
  - Sort: default ID asc
  - Actions: navigate to detail; record browser integration
- Detail (`/companies/:id`)
  - Fields: ID, Name, Contacts (TBD), Notes

---

## Products (`/products`)

- Layout (`app/routes/products.tsx`)
  - Loader: loads minimal product list [{ id, name, sku }] for master table
  - Wraps children in `MasterTableProvider initialRecords={products}`
- Index (`app/routes/products._index.tsx`)
  - Table params: page, perPage, q, sort/dir, filters
  - Default sort: id asc; default perPage: user preference
  - Searchable fields: name, sku, type
  - Filters:
    - sku: contains (insensitive)
    - name: contains (insensitive)
    - type: equals
    - stock: `stockTrackingEnabled` (bool)
    - batch: `batchTrackingEnabled` (bool)
    - minCost: `costPrice >=`
    - maxCost: `costPrice <=`
  - Saved Views: list + active via `?view` param
  - Columns (minimum): ID, SKU, Name (additional columns may be configured)
  - Actions: navigate to detail; apply filters/sorts/search; choose saved view
  - Record Browser: navigates across current product result set
- Detail (`/products/:id`)
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

- Layout: provides master list to Record Browser
- Index: columns ID, Code, Date, Status
- Detail: editable fields code, date, status, notes; lines table with product/qty/cost/sell

## Shipments (`/shipments`)

- Layout: provides master list
- Index: columns ID, Date, Type, Ship Type, Status, Tracking
- Detail: editable fields date, dateReceived, type, status, tracking, packingSlipCode; read-only: carrier/sender/receiver/location; lines table id/product/qty/status

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

## Purchase Orders (`/purchase-orders`)

- Layout: provides master list
- Index: columns ID, Date, Vendor, Consignee, Location
- Detail: editable date; read-only vendor/consignee/location; lines table with product, qty ordered/current/shipped/received, costs, tax

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
  - TaxCodeID → taxCodeId
  - TaxRate → taxRate

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

## Record Browser – Route Expectations

- Detail routes end in an ID segment so header nav can swap the last path segment
- Routes push their record lists to the provider on mount (and when data changes)
- Priority may be used by nested routes to hold control of the list while mounted

---

## Guardrails Checklist (per route)

- [ ] Renders content within AppShell and shows on navigation
- [ ] List/index implements search, sort, pagination (if relevant)
- [ ] Filters wired per route’s mapping
- [ ] RecordBrowser list updates on mount and on data changes
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
