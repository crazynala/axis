# Virtual Table Loading Pattern

This project uses `@tanstack/react-virtual` with two table flavors:

1. `VirtualizedNavDataTable` – Mantine DataTable-style with simple column config
2. `VirtualizedReactTable` – Full `@tanstack/react-table` integration

## Core Concepts

| Concept              | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `count`              | Total rows the virtualizer believes exist (can exceed hydrated rows)      |
| Hydrated slice       | Subset of rows we have fetched from the server (may contain holes)        |
| Placeholder rows     | UI stand-ins for indexes not yet hydrated                                 |
| Visible range effect | Determines which indexes the user can (nearly) see and triggers hydration |

## Lifecycle

1. Virtualizer asks for a set of virtual items (indexes).
2. Component computes `[start, end]` visible window (including overscan).
3. Any indexes without loaded data are collected and passed to `onRequestMissing`.
4. Parent batches a fetch, merges results into `records` array (keeping index alignment), triggering re-render.
5. Placeholders are replaced with real rows.

## Determining `count`

Two modes:

- Incremental Append: `count = records.length`; near-end detection calls `onReachEnd()` to fetch more (classic infinite scroll).
- Sparse / Known Total: `count = totalCount`; holes exist beyond `records.length` or where `records[i]` is `undefined`.

## API Hooks

### `VirtualizedNavDataTable`

Props added:

- `totalCount?: number`
- `onVisibleRangeChange?(range)`
- `onRequestMissing?(indexes: number[])`
- `isIndexLoaded?(index: number): boolean`
- `renderPlaceholderCell?(index, column)`

Effect logic (simplified):

```ts
useEffect(() => {
  const vis = virtualizer.getVirtualItems();
  const start = vis[0].index;
  const end = vis[vis.length - 1].index;
  onVisibleRangeChange?.({ start, end });
  if (onRequestMissing) {
    const missing: number[] = [];
    for (let i = start; i <= end; i++) {
      const loaded = isIndexLoaded ? isIndexLoaded(i) : !!records[i];
      if (!loaded) missing.push(i);
    }
    if (missing.length) onRequestMissing(missing);
  }
}, [virtualizer, records]);
```

### Placeholder Rendering

If `record` is undefined for an index, a placeholder cell is shown (ellipsis `…` by default). Override via `renderPlaceholderCell` for skeletons.

## Scroll-To-Row

When `currentId` changes, we locate its index in hydrated rows and call `virtualizer.scrollToIndex(index, { align: 'center' })`. For sparse mode where the index might not be hydrated yet, parent should:

1. Compute target index server-side (e.g., via ordered query) or hydrate containing page.
2. Insert placeholder rows up to that index.
3. Let the effect trigger missing index fetch.

## TranslateY Calculation

For tables, row translation uses:

```
translateY(virtualRow.start - localIndex * virtualRow.size)
```

because table row layout already positions rows sequentially; we subtract the cumulative local displacement to avoid compounding offsets.

## Best Practices

- Batch missing indexes into a single fetch per animation frame (debounce with `requestAnimationFrame` if needed).
- Guard against duplicate fetches with a Set of in-flight indexes.
- Cap overscan (e.g., 12–30) to balance smoothness vs. request volume.
- When sorting/filtering changes, clear hydrated cache or reindex appropriately.

## Minimal Parent Integration Pseudocode

```ts
const [records, setRecords] = useState<(RowType | undefined)[]>([]);
const inFlight = useRef<Set<number>>(new Set());

function handleRequestMissing(indexes: number[]) {
  const need = indexes.filter((i) => !inFlight.current.has(i));
  if (!need.length) return;
  need.forEach((i) => inFlight.current.add(i));
  fetch(`/api/rows?indexes=${need.join(",")}`)
    .then((r) => r.json())
    .then((payload) => {
      setRecords((prev) => {
        const next = [...prev];
        for (const row of payload.items) next[row.index] = row; // server returns index
        return next;
      });
    })
    .finally(() => need.forEach((i) => inFlight.current.delete(i)));
}
```

---

Feel free to extend this doc with module-specific nuances (Jobs vs Products differing sort keys, etc.).
