# Global Find Pattern

Modules implement a dual-mode (Edit / Find) interface for fast record searches without leaving detail screens.

Components:

1. Provider: `FindProvider` (mounted in `root.tsx`) supplies `mode` and `style` plus sets `<html data-mode>` / `<html data-find-style>` attributes.
2. Hooks: `useProductFindify`, `useJobFindify` each manage two `react-hook-form` instances (edit + find) and helpers `buildUpdatePayload` / `buildFindPayload`.
3. Search Schemas: `product.search-schema.ts`, `job.search-schema.ts` define field → Prisma path mappings consumed by `buildWhere` to build `where` objects.
4. Routing Flow: Detail action handles `_intent=find`, redirects to first match (or index) carrying `?find=1` + criteria echo. Index loader reconstructs the `where` when `?find=1` is present to limit the master list.
5. Auto Exit: After navigation finishes from a search, hooks revert to edit mode automatically.
6. Styles: Style variants (`tint`, `dotted`, `accent`, `criteria`) allow alternate visual emphasis via global data attributes.

Planned refinements:

- Unify product hook to consume global provider (currently sets its own dataset attrs redundantly).
- Extract shared generic hook factory to reduce duplication.
- Add header-level indicator / toggle using `useFind()` for consistent UX across modules.

Behavioral notes:

- Entering find mode blocked when edit form is dirty (prevents discarding unsaved edits).
- Non-edit data sections (assemblies, stock widgets) are hidden during find to reduce noise.
- Location aggregation (c_byLocation) is a gross allocation and may not equal net stock (see prisma spec) – unrelated to find but documented for clarity.
