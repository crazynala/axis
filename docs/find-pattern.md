# Find Architecture Pattern

This document describes the canonical pattern for implementing powerful, FileMaker‑style Find across ERP modules in this Remix codebase.

## Overview

Goals:

- Consistent global keyboard shortcut (⌘/Ctrl + F) that opens a context‑aware find modal / toggles record form into Find mode.
- Shared form components (DetailForm) reused for both edit and find, minimizing divergence.
- Declarative FieldConfig metadata drives rendering (widget, mode visibility, find operator) and where-clause generation.
- Multi‑request (stacked) Find supporting AND within a request and OR / OMIT semantics across requests, similar to FileMaker:
  - Each request: conjunction of its filled criteria.
  - Non‑omit requests: union (OR) of their result sets.
  - Omit requests: subtracted from the union.
- Saved Views persist both simple find params and advanced multi‑request bundles (base64 JSON encoded) for recall & sharing.

## Core Pieces

1. FindContext

   - Provides registerFindCallback(cb) and triggerFind().
   - Root hotkey registers (⌘+F) to call triggerFind() if current route is "find capable".
   - Modules mount a FindManager component that registers a callback returning one of:
     - open modal (e.g., ProductFindModal)
     - toggle in-place form into find mode (Jobs / Products detail route pattern)

2. FieldConfig System (app/formConfigs/\*)

   - Each field definition: { name, label, widget, findOp?, hiddenInModes?, editable?, readOnly?, rangeFields? }.
   - Widgets rendered via renderField(form, cfg, mode, record, ctxExtra).
   - findOp defines how a value maps to Prisma where:
     - equals, contains, startsWith, range (number/date with min/max), in, boolean tri-state (triBool widget), relation child criteria, etc.

3. Shared DetailForm Components

   - JobDetailForm, ProductDetailForm encapsulate layout & field rendering for edit + find. With the modules migration, these live under `app/modules/<domain>/components`.
   - Props: mode ("edit" | "find"), react-hook-form instance, record data, option lists.
   - In find mode, form fields are still controlled via react-hook-form but only used to build a query; no persistence.

4. Find Managers / Modals

   - _Detail Route Toggle Pattern_: Route keeps two forms (editForm, findForm) managed by custom hook (e.g., useProductFindify). Mode switch updates UI; Search posts with intent=find.
   - _Modal Pattern_: For list/index pages, a modal hosts a ProductDetailForm mode=find or a specialized criteria UI.

5. Multi‑Request Engine (app/find/multiFind.ts)

   - Types: MultiFindRequest { omit?: boolean; criteria: Record<string, any> }.
   - encodeRequests / decodeRequests (base64 JSON) => findReqs URL param.
   - buildWhereFromRequests(requests, config) => Prisma where:
     - For each request: AND of criteria converted via FieldConfig findOp mapping.
     - Combine: (OR of non-omit) minus (OR of omit) via NOT conditions.
   - mergeSimpleAndMulti(simpleWhere, multiWhere) => merges single-request and multi stack if both provided.

6. Saved Views (views.server.ts)
   - Stores user-defined view name + serialized filters.
   - Will be extended to include findReqs; older views without it remain valid.

## Simple vs Multi Criteria

- Simple (current): individual query params (e.g., sku=ABC&stockTrackingEnabled=true).
- Multi: findReqs=BASE64 where BASE64 decodes to JSON array of requests. Each request holds raw field inputs (same names as simple params) plus omit flag.
- Loader logic: parse simple params → simpleWhere; decode findReqs → multiWhere; finalWhere = mergeSimpleAndMulti(simpleWhere, multiWhere).

## UI: Multi Criteria (Implemented)

Advanced mode (Products) provides:

- Request strip with numbered pills; each shows OMIT badge when flagged.
- Actions: Duplicate, Toggle Omit, Delete, Add new request.
- Active request criteria use shared `ProductDetailForm` in find mode.
- Live synchronization of form values into the active request's criteria set.
- Search encodes the current stack as `findReqs=<base64>` plus `find=1`.

Semantics Example:

1. Request A: sku contains "ABC" (non-omit)
2. Request B: type = Finished (non-omit)
3. Request C: supplierId = 42 (omit)
   Result: (SKU like %ABC% OR type = Finished) AND NOT (supplierId = 42)

## Implementing a New Module

1. Define FieldConfig arrays in formConfigs/<entity>Detail.tsx.
2. Create <Entity>DetailForm using those configs.
3. Build <Entity>FindModal or toggle pattern (clone Product/Job examples).
4. Add <Entity>FindManager that registers the callback with FindContext.
5. Extend loader to parse simple params + decode multi via multiFind.ts helpers.
6. Update saved views persistence to include any new find params.
7. Document any special relational criteria mapping (e.g., componentChild\* for BOM).

## Query Param Naming Conventions

- range fields: costPriceMin / costPriceMax by default (can override via rangeFields: { min, max }).
- triBool: value in { true, false } (omit => any).
- Child relational filters prefixed (e.g., componentChildSku) are mapped manually in where builder.

## Saved Views (Current State)

Views now persist any `find` flag and `findReqs` parameter inside `filters`. When loading a view those are re-applied unless explicitly overridden by the current URL. Legacy views without `findReqs` continue to function.

## Find Ribbon & URL semantics: keepKeys and labelMap

To standardize the list/index UX, modules use a shared FindRibbon wrapped by `FindRibbonAuto`. Two ergonomic options matter here:

- keepKeys: list of URL params to preserve when changing filters or switching views. Defaults: `view`, `sort`, `dir`, `perPage`. We intentionally do not preserve `page` so pagination resets to page 1 on filter changes. Add `"page"` to keepKeys in modules where you want to keep it.
- labelMap: per-module mapping from query param keys to human‑friendly chip labels for simple filters (e.g., `{ sku: "SKU", isInactive: "Archived" }`).

Action behavior with keepKeys:

- Select View: Clears non‑preserved params (simple filters and `findReqs`), applies `view` (omitted for "All"), resets `page` unless preserved.
- Remove Chip: Deletes only that filter key. Resets `page` unless preserved.
- Clear Advanced: Deletes `findReqs`. Resets `page` unless preserved.
- Cancel: Returns to view mode by clearing all non‑preserved filters and ensuring `view` reflects the active view. Resets `page` unless preserved.

Usage example:

```
<FindRibbonAuto
   views={views}
   activeView={activeView}
   keepKeys={["view", "sort", "dir", "perPage", "tab"]}
   labelMap={{ sku: "SKU", type: "Type", supplierId: "Supplier" }}
/>
```

## Future Enhancements

- Export / import view definitions.
- Shareable encoded hash capturing both layout + find.
- Date range quick-picks & relative date operators (e.g., last 7 days).
- Validation layer ensuring incompatible criteria sets flagged early.

## Generic Multi-Find Adapter (GenericMultiFindModal)

To eliminate duplication across modules, `GenericMultiFindModal` provides a reusable simple/advanced find UI shell. Modules supply an adapter describing how to build default values and enumerate field configs, plus a form component.

Adapter interface:

```
interface MultiRequestAdapter<TValues> {
   buildDefaults(): TValues;              // Return an object with default (empty) find values
   allFields(): FindFieldConfig[];        // Return every FieldConfig that could participate in find
   title: string;                         // Modal title (e.g., "Find Products")
}
```

Usage pattern:

1. Ensure your module already has a `<Entity>DetailForm` that accepts `mode="find"` and a `form` prop (react-hook-form instance).
2. Implement `buildDefaults()` returning a pristine values object (matching field names).
3. Implement `allFields()` returning a flattened list of every FieldConfig containing `findOp` you want exposed.
4. Wrap the generic modal (adapter + form component typically live under `app/modules/<domain>`):

```
export function ProductFindModal(props: ProductFindModalProps) {
   return (
      <GenericMultiFindModal
         opened={props.opened}
         onClose={props.onClose}
         onSearch={props.onSearch}
         initialValues={props.initialValues}
         adapter={{ buildDefaults, allFields: allProductFindFields, title: 'Find Products' }}
         FormComponent={ProductDetailForm}
      />
   );
}
```

Advanced Mode behavior (internals):

- Maintains `multi.requests: MultiFindRequest[]` each with `criteria` + `omit`.
- Active request values load into a single RHF form; on blur or search we sync values back into the active request.
- Search constructs either simple query params or `findReqs=<encoded>` using `encodeRequests` (compact format) and hands off to caller via `onSearch`.
- Consumers decide navigation (e.g., `navigate(/products?${qs})`).

Extending to New Module:

- Supply new adapter + reuse `GenericMultiFindModal`.
- Add interpreters for each field to your loader when decoding multi requests (see products/jobs loader examples).
- Add saved view persistence of `findReqs` (already generic in existing `saveView` code if you pass through filters).

Request Summaries (Planned / Implemented if present in modal):

- Each request can surface a short summary (e.g., `sku~foo, type=Finished` or `OMIT supplierId=42`). See GenericMultiFindModal for summary generation hook (`summarizeRequest`).

Versioning:

- `encodeRequests` supports a compact v2 format (`{ r:[ { c:{...} }, { o:1,c:{...}} ] }`). Legacy decode remains for backward compatibility.

Testing Checklist When Adapting:

- Simple search unchanged? (no `findReqs` param)
- Advanced search encodes/decode round trip stable?
- Omit logic yields expected subtraction in result set?
- Saved views restore both simple params and multi stack?
- URL length acceptable (remove extraneous defaults)?

---

Last updated: 2025-09-10.
