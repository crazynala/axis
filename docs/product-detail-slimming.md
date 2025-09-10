# Product Detail Route Slimming Plan

Date: 2025-09-10
Context: The `products.$id.tsx` route has been refactored to centralize Find mode ("Findify") logic inside `useProductFindify`. Next objective: further slim the route and fold header controls into small, reusable components without re‑introducing context/provider overhead.

## Goals

- Reduce route file size / cognitive load.
- Make domain sections (header, primary fields, BOM, stock, movements, picker, danger zone) independently testable.
- Keep Find (search) vs Edit mode concerns encapsulated in hook + minimal UI wrappers.
- Enable future lazy loading of heavier sections (tables) if performance requires.

## Phase 1: Immediate Cleanups

1. Remove unused imports (FindToggle, NumberInput, Switch, any no longer referenced Mantine symbols).
2. Reorder imports: external libs, design system (@mantine), shared timber utilities, local components, hooks, types.
3. Add explicit prop types for extracted components (e.g. `ProductHeaderControlsProps`).
4. Co-locate small presentational pieces under `app/components/product/` with a barrel `index.ts` for cleaner imports.

## Phase 2: Extract Header Controls

Component: `ProductHeaderControls`
Props:

- `breadcrumbs: { label: string; href: string }[]`
- `mode: 'edit' | 'find'`
- `style: 'tint' | 'dotted' | 'accent' | 'criteria'`
- `onToggleFind(): void`
- `onSearch(): void` (only active in find mode)
- `onStyleChange(style: ProductFindStyle): void`
- `recordBrowser`: Return value of `useRecordBrowser(...)`
- `busy?: boolean` (optional for disabling buttons)
  Behavior:
- Render breadcrumb trail (or accept an already-rendered component to keep it flexible).
- Show: Find toggle always, Search + Style segmented control conditionally when `mode === 'find'`.
- Delegate gating to hook (i.e., just call `onToggleFind`).

## Phase 3: Primary Fields Refactor

Replace inline conditional JSX with a field configuration array processed by a small renderer.
Example Config Entry:

```ts
{ name: 'sku', label: 'SKU', placeholderFind: 'contains…', mode: 'both', component: TextAny }
```

Renderer outputs either find-wrapped searchable div or direct component depending on mode + config.
Benefits: Collapses repeated ternary blocks; easier to add/remove fields.

## Phase 4: Domain Section Components

Create components:

- `ProductPrimaryFields` (uses config + activeForm + product readonly fields when edit mode)
- `ProductRelationsFields` (customer, variant set, tri-bools)
- `ProductCommercialFields` (cost/sale prices, tax, category, supplier)
- `ProductBOMEdit` (Bill of Materials table + Add button)
- `ProductBOMFindCriteria` (the find-only BOM criteria table)
- `ProductStockPanels` (Stock by Location + Batch + filters)
- `ProductMovements` (segmented control + movements table)
- `ProductComponentPickerModal` (picker modal with search & filter, receives `open`, `onClose`, `products`, `onAdd`)
- `ProductDangerZone` (delete form/button)

Each receives minimal typed props. No direct dependence on Remix hooks (submit, navigation) except where necessary; parent passes callbacks.

## Phase 5: Hook Enhancements

Augment `useProductFindify` (if desired):

- Expose `onSearch()` convenience bound to current `findForm.getValues()`.
- Provide `headerProps` object ready for spread into `ProductHeaderControls` to reduce route glue.
- Optional mini-hooks: `useProductBatchFilters(stockByBatch)` returning `{ batchScope, setBatchScope, batchLocation, setBatchLocation, batchLocationOptions, filteredBatches }`.
- Optional `useComponentPicker(productChoices)` returning `{ filteredChoices, search, setSearch, assemblyItemOnly, setAssemblyItemOnly }`.

## Phase 6: Route Skeleton After Extraction

```tsx
export default function ProductDetailRoute() {
  const data = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const { editForm, findForm, activeForm, mode, style, setStyle, toggleFind, buildUpdatePayload, buildFindPayload } = useProductFindify(data.product, nav);
  const recordBrowser = useRecordBrowser(data.product.id, masterRecords);
  const header = (
    <ProductHeaderControls
      breadcrumbs={[...]} mode={mode} style={style}
      onToggleFind={toggleFind}
      onSearch={() => submit(buildFindPayload(findForm.getValues()), { method: 'post' })}
      onStyleChange={setStyle}
      recordBrowser={recordBrowser}
    />
  );
  return (
    <Stack gap="lg">
      {header}
      <ProductPrimaryFields mode={mode} product={data.product} form={activeForm} />
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <ProductRelationsFields form={activeForm} product={data.product} companies={data.companyOptions} />
        <ProductCommercialFields form={activeForm} taxCodes={...} categories={...} companies={...} />
      </SimpleGrid>
      {mode==='find' && <ProductBOMFindCriteria form={findForm} companies={data.companyOptions} />}
      {mode==='edit' && <ProductBOMEdit product={data.product} onAddComponent={...} />}
      {mode==='edit' && <ProductStockPanels stockByLocation={...} stockByBatch={...} />}
      {mode==='edit' && <ProductMovements movements={...} movementHeaders={...} locationNameById={...} />}
      <ProductComponentPickerModal ... />
      <ProductDangerZone busy={busy} onDelete={...} />
    </Stack>
  );
}
```

## Phase 7: Type & Build Verification

- Run TypeScript build after each extraction batch.
- Ensure no circular imports (avoid `index.ts` referencing route while route imports barrel).
- Confirm tree-shaking removed unused Mantine components from bundle.

## Phase 8: Optional Performance Enhancements

- Dynamic import heavy tables: wrap `ProductMovements` & `ProductStockPanels` with `lazy()` + Suspense fallback.
- Memoize derived arrays (filtered batches, filtered product choices) in their hooks; components receive stable references.
- Consider virtualization (Mantine or react-virtualized) if product lines or movements become large.

## Phase 9: Testing (Optional, Light)

- Add test for header controls: toggling mode triggers `onToggleFind`.
- Snapshot test for primary fields in edit vs find mode using a mock form object.

## Phase 10: Documentation & Developer Notes

- Update README or add a short section referencing this doc.
- Encourage adding new product-related UI by creating a component under `components/product` instead of expanding the route.

## Sequencing Recommendation

1. Header extraction (fastest win).
2. Primary/relations/commercial field components.
3. BOM + Find criteria.
4. Stock & Movements.
5. Picker modal + danger zone.
6. Config-driven field renderer & hook enhancements.
7. Optional perf (lazy, virtualization).

## Risks & Mitigations

- Over-fragmentation: Keep component boundaries coarse (domain sections) to avoid prop drilling fatigue.
- Form context leakage: Pass only the specific `control` / `register` functions needed to children.
- Naming sprawl: Use `Product*` prefix for clarity.

## Done Definition

Route under ~150 lines (excluding loader/action). No repeated ternary field blocks. All heavy UI isolated. Find mode toggle & search unaffected.

---

Prepared for internal review before implementation.
