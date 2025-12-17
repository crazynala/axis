# Assembly group pivot – plan

Goal: pivot from “group = multi-grid detail” to “group = coordination only,” with pooled cut events owned by a group event.

## 0. Guiding rules

- [ ] Assemblies are atomic; no page renders multiple assembly qty grids.
- [ ] AssemblyGroup is coordination-only; no combined progress object.
- [ ] Pooled cut creates N activities + 1 product movement; edit/delete must be atomic via group event.
- [ ] Group-generated activities are not deletable directly.
- [ ] Pooled cut requires per-assembly size breakdowns.
- [ ] No backfills; only new events use the new linkage.

## 1. Schema + migrations

- [x] Add `AssemblyGroupEvent` model (type, eventDate, notes, jobId).
- [x] Add `assemblyGroupEventId` on `AssemblyActivity` (nullable).
- [x] Add `assemblyGroupEventId` on `ProductMovement` (nullable).
- [x] Indexes on `assemblyGroupEventId` and `assemblyGroupId,eventDate`.

## 2. Services / logic

- [x] `createPooledCutEvent` service (transactional):
  - Validate group membership for all assemblies.
  - Create group event.
  - Create one cut activity per assembly with `assemblyGroupEventId`.
  - Create one pooled `ProductMovement` + `ProductMovementLine` for fabric consumption.
  - OperationLog entry with per-assembly totals + meters.
- [x] `deleteAssemblyGroupEvent` service (transactional):
  - Delete movement lines, movement, activities, then event.
  - OperationLog entry with counts.
- [x] Guard direct activity delete if `assemblyGroupEventId != null`; return structured error.

## 3. UI / routes

- [x] Remove multi-assembly detail rendering (no group-detail in assembly route).
- [x] Assembly detail: show group badge + “View group” drawer.
- [ ] Group drawer:
  - [x] List member assemblies + lightweight rollups.
  - [ ] “Record pooled cut” modal with size breakdown per assembly.
  - [ ] Submit to pooled cut service and refresh.
- [ ] Activity list: group-generated rows show “Group event” chip; open drawer.

## 3.1 Blocking decision

- [ ] Waiting on your choice for pooled cut modal input:
  - Option 1: filtered fabric product list from loader.
  - Option 2: full product search/picker in modal.

## 4. Tests / UAT

- [ ] Create group with 2 assemblies → record pooled cut:
  - 2 activities created with correct qtyBreakdown + totals.
  - 1 product movement created with correct meters.
  - Assembly cut totals update.
- [ ] Attempt direct delete of group-generated activity → blocked with message.
- [ ] Delete group event → activities + movement removed; totals revert.
- [ ] OperationLog contains create/delete entries.
