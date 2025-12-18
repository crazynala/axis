# Job Detail Route Parity Checklist

Refactor parity contract for `app/modules/job/routes/jobs.$id.tsx`.

## Loader

### Redirect behavior
- Missing/invalid `id` → redirects to `/jobs`
- Missing job record → redirects to `/jobs`

### Loader JSON shape (treat as public API)
- `job`
- `productsById`
- `assemblyTypes`
- `customers`
- `productChoices`
- `groupsById`
- `activityCounts`

## Action

### `_intent` strings (must be preserved)
- `find`
- `job.update`
- `job.duplicate`
- `job.delete`
- `assembly.createFromProduct`
- `assembly.updateOrderedBreakdown`
- `assembly.group`
- `assembly.duplicate`
- `assembly.ungroupOne`
- `assembly.delete`
- `assembly.state`
- default fallthrough → redirect to `/jobs/:id`

### Redirect/query param patterns
- Job state errors: redirect to `/jobs/:id?jobStateErr=...`
- Delete job errors:
  - confirm mismatch → `/jobs/:id?deleteError=confirm`
  - has activity → `/jobs/:id?deleteError=activity`
- Group assemblies errors → `/jobs/:id?asmGroupErr=missing,status,activity`
- Delete assembly errors → `/jobs/:id?asmDeleteErr=hasActivity&asmId=...`

