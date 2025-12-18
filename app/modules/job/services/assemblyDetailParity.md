# Assembly Detail Route Parity Checklist

This document is the refactor parity contract for `app/modules/job/routes/jobs.$jobId.assembly.$assemblyId._index.tsx`.

## Loader

### Redirect behavior
- Missing/invalid `assemblyId` list → redirects to `/jobs`
- Multi-assembly `assemblyId` param (comma-separated list) → redirects to `/jobs/:jobId/assembly/:firstId`
- Empty result set (no matching assemblies) → redirects to `/jobs`

### Loader JSON shape (treat as public API)
The loader returns a JSON object with these keys (no renames):
- `job`
- `assemblies`
- `quantityItems`
- `costingStats`
- `activities`
- `activityConsumptionMap`
- `products`
- `productVariantSet`
- `packContext`
- `packActivityReferences`
- `assemblyTypes`
- `defectReasons`
- `groupInfo`
- `primaryCostingIdByAssembly`
- `toleranceDefaults`
- `rollupsByAssembly`
- `vendorOptionsByStep`
- `materialCoverageByAssembly`
- `canDebug`

### Optionality / null vs undefined
- Keys that are conditionally `undefined` must remain conditionally `undefined` (so they may be omitted from JSON serialization).
- Keys that are explicitly `null` must remain explicitly `null` (e.g. `packActivityReferences` defaults to `null`).

### Stage + external-step pipeline
- Stage quantities, stage rows, and derived external steps are produced only through:
  - `aggregateAssemblyStages(...)`
  - `buildExternalStepsByAssembly(...)`
  - `buildStageRowsFromAggregation(...)`

## Action

### `_intent` + form field names
- Preserve all `_intent` string values exactly.
- Preserve all form field names exactly.
- Preserve redirect targets and `json({ error }, { status })` patterns.

### Intent list
- `group.event.create.cut`
- `group.event.delete`
- `group.activity.create.cut`
- `group.activity.create.finish`
- `group.updateOrderedBreakdown`
- `assembly.update`
- `assembly.update.fromGroup`
- `assembly.groupState`
- `costing.create`
- `costing.enable`
- `costing.disable`
- `costing.delete`
- `costing.refreshProduct`
- `activity.delete`
- `activity.create.cut`
- `activity.create.finish`
- `activity.create.pack`
- `activity.update`
- `activity.create.defect`
- `externalStep.send`
- `externalStep.receive`
- `assembly.updateOrderedBreakdown`
- default fallthrough → redirect to `/jobs/:jobId/assembly/:assemblyId`

