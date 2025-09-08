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
- Logging
  - Client logger with module levels from `window.__LOG_LEVELS__`
  - Server pino; warn/error beacons to `/log`
  - Admin persists levels via Prisma `SavedView` (module=log, name=levels)

---

## Admin (`/admin`)

- Logging Settings
  - Per-module level dropdowns: silent, error, warn, info, debug, trace
  - Save persists and updates client levels without reload
- Value Lists (where enabled)
  - Create/Delete list
  - Upload from Excel

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

---

## Costings (`/costings`)

- Index
  - Columns: ID, Component, Usage, Qty/Unit, Unit Cost
  - Actions: navigate to related product/assembly (where linked)

---

## Jobs (`/jobs`)

- Index
  - Columns: ID, Name/Project Code (TBD), Status
  - Search/Filters: name/code
  - Actions: navigate to job detail; record browser integration
- Job Detail (`/jobs/:jobId`)
  - Top Left card
    - Not editable: id
    - Editable: projectCode, name, customer (company picker)
  - Top Right card
  - Editable: customerOrderDate, targetDate, dropDeadDate, startDate, endDate,
    jobType, status, type, endCustomerName, customerPoNum (new schema field)
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
  - Columns: ID, Component (name/sku/id), Usage, Qty/Unit, Unit Cost
  - Actions:
    - Add costing (modal): search products, Quantity Per Unit, Unit Cost, Usage Type (cut/make)
      - Action intent: `costing.create`
    - Delete costing: `costing.delete`
- Activity History panel
  - Columns: ID, Name, Job, End, Variant qty columns, Notes
  - Actions: delete activity: `activity.delete`
- Form actions
  - Update assembly fields (name, status): `assembly.update`

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
