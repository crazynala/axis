# Findify + Forms Architecture

## 1) Executive summary
Findify is the system that powers “find” across modules by reusing declarative form configs (FieldConfig) to build URL query strings and server-side Prisma filters. It owns:
- The Find modal UI (simple + advanced multi-request), query serialization, and URL param plumbing.
- A shared FieldConfig-based form renderer that supports edit/create/find modes and consistent widget behavior.
- Helper utilities for decoding/encoding multi-find requests and building Prisma `where` clauses.

It does **not** own module-specific loaders/actions or data access; each module wires Findify by providing FieldConfig arrays, find defaults, and loader logic to parse query params.

## 2) Key concepts & data flow (text diagram)

```
[Module Index Route] --renders--> [FindManager] --opens--> [GenericMultiFindModal]
    |                                     |                    |
    |                                     |                    v
    |                                     |             [FieldConfig arrays]
    |                                     |                    |
    |                                     |                    v
    |                                     |            query params + findReqs
    |                                     v                    |
    |                               navigate(/module?qs)       |
    v                                                          v
[Module Loader] --parses--> URLSearchParams ---decode/merge--> Prisma where
    |
    v
idList + initialRows (hybrid table window)
```

Core flow:
1) Find modal renders module’s FieldConfig arrays in “find” mode.
2) Modal serializes form values to URL params (simple) or `findReqs` (advanced multi-request).
3) Module’s loader parses URL params + `findReqs`, builds Prisma `where` (simple + multi), and returns the found set.
4) Hybrid window/table uses idList to render results.

## 3) Core primitives (file path, purpose, usage)

### Find context and global trigger
- **File:** `app/base/find/FindContext.tsx`
- **Purpose:** global registry for “open find modal” callbacks and mode flags.
- **Key API:** `registerFindCallback(cb)` and `triggerFind()`; `mode` is `edit|find`.

```tsx
// app/base/find/FindContext.tsx
const registerFindCallback = (cb: () => void) => {
  callbacksRef.add(cb);
  return () => callbacksRef.delete(cb);
};
const triggerFind = () => {
  // Calls the most recently registered callback
};
```

### FieldConfig + RenderGroup
- **File:** `app/base/forms/fieldConfigShared.tsx`
- **Purpose:** declarative form schema for edit/find/create; renders widgets consistently.
- **Key fields:** `widget`, `findOp`, `hiddenInModes`, `readOnlyIf`, `optionsKey`, `rangeFields`, `showIf`.

```tsx
// app/base/forms/fieldConfigShared.tsx
export type FieldConfig = {
  name: string;
  label: string;
  widget?: "text" | "select" | "idStatic" | "triBool" | "numberRange" | "date";
  findOp?: "contains" | "equals" | "range" | string;
  hiddenInModes?: FieldMode[];
  readOnlyIf?: (args) => boolean;
  optionsKey?: string; // maps to ctx.fieldOptions[key]
  rangeFields?: { min?: string; max?: string };
  showIf?: (args) => boolean;
};
```

```tsx
// app/base/forms/fieldConfigShared.tsx
export function RenderGroup({ form, fields, mode, ctx }: { ... }) {
  form.watch(); // keep conditional fields reactive
  const visible = fields.filter((f) => !f.hiddenInModes?.includes(mode));
  return visible.map((field) => <RenderField ... />);
}
```

### OptionsKey → options mapping
- **Files:**
  - `app/base/forms/fieldConfigShared.tsx` (RenderField)
  - `app/base/options/OptionsContext.tsx`
  - `app/base/options/OptionsClient.ts`
  - `app/utils/options.server.ts`
- **Purpose:** map `optionsKey` to option arrays (select lists) using the OptionsContext.

```tsx
// app/base/forms/fieldConfigShared.tsx
const getSelectOptions = () => {
  const primary = field.optionsKey && ctx?.fieldOptions?.[field.optionsKey]
    ? ctx.fieldOptions[field.optionsKey]
    : [];
  const fallback = field.allOptionsKey && ctx?.fieldOptions?.[field.allOptionsKey]
    ? ctx.fieldOptions[field.allOptionsKey]
    : [];
  return { primary, fallback };
};
```

```tsx
// app/base/forms/fieldConfigShared.tsx
export function RenderField({ form, field, mode, ctx }: { ... }) {
  const options = useOptions();
  const autoCtx = {
    ...ctx,
    fieldOptions: {
      ...(ctx?.fieldOptions || {}),
      customer: ctx?.fieldOptions?.customer ?? map(options?.customerOptions),
      supplier: ctx?.fieldOptions?.supplier ?? map(options?.supplierOptions),
      location: ctx?.fieldOptions?.location ?? map(options?.locationOptions),
      // ...more mappings
    },
  };
  return renderField(form, field, mode, autoCtx);
}
```

### Generic multi-find modal
- **File:** `app/components/find/GenericMultiFindModal.tsx`
- **Purpose:** reusable find modal with simple and advanced (multi-request) modes.
- **Key props:** `adapter { buildDefaults, allFields, title }`, `FormComponent`.

```tsx
// app/components/find/GenericMultiFindModal.tsx
<GenericMultiFindModal
  adapter={{ buildDefaults, allFields, title: "Find Products" }}
  FormComponent={ProductDetailForm}
/>
```

### Multi-request encoding/decoding
- **File:** `app/base/find/multiFind.ts`
- **Purpose:** encode multi-request find criteria to `findReqs` and build Prisma where.

```ts
// app/base/find/multiFind.ts
export function encodeRequests(state: MultiFindState): string { /* base64 */ }
export function decodeRequests(b64: string | null): MultiFindState | null { /* base64 -> state */ }

// Request = AND of criteria; non-omit requests OR'ed; omit requests subtracted.
export function buildWhereFromRequests(state, interpreters) { /* -> Prisma where */ }
```

### Schema-driven find (optional)
- **File:** `app/base/find/buildWhere.ts`
- **Purpose:** turn structured `SearchSchema` into Prisma `where` for find params.

```ts
// app/base/find/buildWhere.ts
export function buildWhere(values, schema) {
  // walks schema.fields + related, builds AND blocks
}
```

```ts
// app/base/find/findify.types.ts
export type FieldDef = { kind: "text" | "id" | "bool" | "number-min" | "number-max"; path: string };
export type SearchSchema<V, W> = { fields: ..., related?: ... };
```

### Find ribbon (filters UI)
- **Files:**
  - `app/base/find/FindRibbon.tsx`
  - `app/components/find/FindRibbonAuto.tsx`
- **Purpose:** renders active filters as chips and view tabs; clears or saves views.

```tsx
// app/components/find/FindRibbonAuto.tsx
const inFindMode = sp.has("findReqs") || Object.keys(simpleParams).length > 0;
<FindRibbon
  mode={inFindMode ? "find" : "view"}
  filterChips={defaultSummarizeFilters(simpleParams)}
  advancedActive={sp.has("findReqs")}
/>
```

## 4) Declarative forms (FieldConfig patterns + widgets + modes)
FieldConfig arrays live in each module’s `forms/*Detail.tsx` and define both edit and find behavior. Widgets are interpreted by `renderField()` and `RenderGroup()`.

Common patterns:
- `findOp` controls how values become filters.
- `hiddenInModes` hides fields from certain modes (e.g., edit-only or find-only).
- `readOnlyIf` allows dynamic locks.
- `optionsKey` maps to cached options lists.

Example (company fields):
```tsx
// app/modules/company/forms/companyDetail.tsx
export const companyMainFields: FieldConfig[] = [
  { name: "id", label: "ID", widget: "idStatic", findOp: "equals" },
  { name: "name", label: "Name", findOp: "contains" },
  { name: "isCarrier", label: "Carrier", widget: "triBool", findOp: "equals" },
];
```

Example (product fields with selects + numberRange):
```tsx
// app/modules/product/forms/productDetail.tsx
{ name: "type", label: "Type", widget: "select", optionsKey: "productType", findOp: "equals" },
{ name: "costPrice", label: "Cost Price", widget: "numberRange", findOp: "range" },
```

Modes:
- `FieldMode` is `edit | find | create` (`app/base/forms/fieldConfigShared.tsx`).
- `renderField()` respects `hiddenInModes` and `readOnlyIf`, and uses `findPlaceholder` for find inputs.

## 5) How Findify builds filters + query strings + loader inputs

### Simple find (query params)
`GenericMultiFindModal` serializes form values into standard query params using FieldConfig’s `findOp` and range fields.

```tsx
// app/components/find/GenericMultiFindModal.tsx
const buildParamsFromValues = (vals) => {
  const params = new URLSearchParams();
  for (const f of fields) {
    if (!f.findOp) continue;
    if (f.widget === "numberRange") { /* min/max */ }
    else params.set(f.name, serializeValue(vals[f.name]));
  }
  return params;
};
```

### Advanced find (multi-request)
The modal encodes multiple requests into `findReqs` (base64 JSON). Modules decode with `decodeRequests` and interpret via a map of field handlers.

```ts
// app/base/find/multiFind.ts
const multi = decodeRequests(url.searchParams.get("findReqs"));
const multiWhere = buildWhereFromRequests(multi, interpreters);
const where = mergeSimpleAndMulti(simpleWhere, multiWhere);
```

### Two server patterns (both in use)
1) **Interpreter map** (common): Build `simpleWhere` manually + `buildWhereFromRequests`.
   - **Example:** `app/modules/company/routes/companies.tsx`

```ts
// app/modules/company/routes/companies.tsx
const multi = decodeRequests(url.searchParams.get("findReqs"));
const interpreters = {
  name: (v) => ({ nameUnaccented: { contains: unaccent(v), mode: "insensitive" } }),
  isCarrier: (v) => ({ isCarrier: v === "true" }),
};
const multiWhere = buildWhereFromRequests(multi, interpreters);
where = mergeSimpleAndMulti(simple, multiWhere);
```

2) **SearchSchema + buildWhere** (for complex modules):
   - **Example:** `app/modules/product/routes/products.tsx`

```ts
// app/modules/product/routes/products.tsx
const simpleBase = buildWhere(valuesForSchema, productSearchSchema);
const multi = decodeRequests(q.get("findReqs"));
const multiWhere = buildWhereFromRequests(multi, interpreters);
findWhere = mergeSimpleAndMulti(simple, multiWhere);
```

## 6) How a module registers/participates
A Findify-enabled module typically includes:
- `modules/<domain>/forms/*Detail.tsx` → FieldConfig arrays and `all*FindFields()`.
- `modules/<domain>/components/*FindModal.tsx` → wraps `GenericMultiFindModal`.
- `modules/<domain>/findify/*FindManager.tsx` → registers callback, handles navigation.
- `modules/<domain>/routes/<module>.tsx` → loader parses query params + `findReqs`.
- `modules/<domain>/routes/<module>._index.tsx` → renders find manager + FindRibbon.

Routes are registered in `app/routes.ts`:
```ts
// app/routes.ts
...(await flatRoutes({ rootDirectory: "modules/company/routes" })),
...(await flatRoutes({ rootDirectory: "modules/product/routes" })),
```

## 7) Worked examples

### Example A: Companies

**FieldConfig**
- `app/modules/company/forms/companyDetail.tsx`
```tsx
export const companyMainFields: FieldConfig[] = [
  { name: "id", label: "ID", widget: "idStatic", findOp: "equals" },
  { name: "name", label: "Name", findOp: "contains" },
  { name: "isCarrier", label: "Carrier", widget: "triBool", findOp: "equals" },
];
export function allCompanyFindFields() { return [...companyMainFields]; }
```

**Find modal + manager**
- `app/modules/company/components/CompanyFindModal.tsx`
- `app/modules/company/findify/CompanyFindManagerNew.tsx`
```tsx
<GenericMultiFindModal
  adapter={{ buildDefaults: buildCompanyDefaults, allFields: allCompanyFindFields, title: "Find Companies" }}
  FormComponent={CompanyDetailForm}
/>
```
```tsx
useEffect(() => registerFindCallback(() => setOpened(true)), [registerFindCallback]);
```

**Loader parsing find params**
- `app/modules/company/routes/companies.tsx`
```ts
const multi = decodeRequests(url.searchParams.get("findReqs"));
const interpreters = { name: (v) => ({ nameUnaccented: { contains: unaccent(v), mode: "insensitive" } }) };
const multiWhere = buildWhereFromRequests(multi, interpreters);
where = mergeSimpleAndMulti(simple, multiWhere);
```

**Find ribbon**
- `app/modules/company/routes/companies._index.tsx`
```tsx
<FindRibbonAuto views={[]} activeView={null} />
<CompanyFindManagerNew />
```

### Example B: Products

**FieldConfig**
- `app/modules/product/forms/productDetail.tsx`
```tsx
export const productIdentityFields: FieldConfig[] = [
  { name: "type", label: "Type", widget: "select", optionsKey: "productType", findOp: "equals" },
  { name: "sku", label: "SKU", findOp: "contains" },
];
export const productPricingFields: FieldConfig[] = [
  { name: "costPrice", label: "Cost Price", widget: "numberRange", findOp: "range" },
];
export function allProductFindFields() {
  return [...productIdentityFields, ...productAssocFields, ...productPricingFields, ...productBomFindFields];
}
```

**Find modal + manager**
- `app/modules/product/components/ProductFindModal.tsx`
- `app/modules/product/components/ProductFindManager.tsx`
```tsx
<GenericMultiFindModal
  adapter={{ buildDefaults, allFields: allProductFindFields, title: "Find Products" }}
  FormComponent={ProductDetailForm}
/>
```

**Loader (schema + multi)**
- `app/modules/product/routes/products.tsx`
```ts
const simpleBase = buildWhere(valuesForSchema, productSearchSchema);
const multi = decodeRequests(q.get("findReqs"));
const multiWhere = buildWhereFromRequests(multi, interpreters);
findWhere = mergeSimpleAndMulti(simple, multiWhere);
```

## 8) Edge cases / gotchas
- **Large found sets:** Most loaders cap `idList` (e.g., `ID_CAP = 50000`) and load windows for tables. See `app/modules/company/routes/companies.tsx` and `app/modules/product/routes/products.tsx`.
- **Multi-find blob size:** Advanced find uses base64 `findReqs`. Keep criteria small to avoid URL length limits. (`app/base/find/multiFind.ts`)
- **Options loading:** Select widgets depend on `optionsKey` mapping. Missing options in ctx will render empty lists. (`app/base/forms/fieldConfigShared.tsx`)
- **Find vs edit read-only:** `renderField()` enforces `readOnlyIf` + `editable` flags differently for edit vs find. (`app/base/forms/fieldConfigShared.tsx`)
- **Range fields:** `numberRange` uses `fooMin/fooMax` naming by default or `rangeFields`. `GenericMultiFindModal` and server builders both support this.
- **Server validation patterns:** Findify is client-side only; loaders must still guard types (e.g., `Number(v)` coercion in interpreters). See `app/modules/product/routes/products.tsx`.
- **FormData conventions:** Find modal submits via navigation to `?qs`; save-view uses `_intent=saveView` in the list route (`app/base/find/FindRibbon.tsx`, `app/components/find/FindRibbonAuto.tsx`).

## Integration checklist (new module)
1) Create FieldConfig arrays in `modules/<domain>/forms/*Detail.tsx` with `findOp` on fields you want searchable.
2) Add `all<Domain>FindFields()` helper that returns a flattened list.
3) Implement `<Domain>FindModal` using `GenericMultiFindModal` and the module’s detail form.
4) Implement `<Domain>FindManager` using `useFind().registerFindCallback` and `navigate(/domain?qs)`.
5) In the module list route loader, parse URL params + `findReqs`, build Prisma `where` via `buildWhereFromRequests` (or `buildWhere` + schema).
6) Render `FindRibbonAuto` and the `<Domain>FindManager` in the index route.
7) Register module routes in `app/routes.ts` via `flatRoutes({ rootDirectory: "modules/<domain>/routes" })`.
