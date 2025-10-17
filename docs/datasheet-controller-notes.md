# Datasheet Controller Hook (RHF-like)

This document captures the design, implementation details, and remaining work for the new controller hook that makes the datasheet behave more like React Hook Form.

## Summary

We added `useDataSheetController<T>` to our forked `react-datasheet-grid`. The hook centralizes value management, initial snapshot, dirtiness, and undo/redo history. The BOM full-zoom route was refactored to use it.

## Hook API

```
const controller = useDataSheetController<T>(initial: T[], options?: {
  sanitize?: (rows: T[]) => any
  compare?: (a: any, b: any) => boolean
  historyLimit?: number
})

controller.value: T[]
controller.onChange(next: T[]): void
controller.setValue(next: T[]): void
controller.getValue(): T[]
controller.reset(nextInitial?: T[]): void
controller.setInitial(nextInitial: T[]): void
controller.undo(): void
controller.redo(): void
controller.state: {
  isDirty: boolean
  canUndo: boolean
  canRedo: boolean
  historyLength: number
  index: number
}
```

### Behavior

- `sanitize` maps rows to a shape used for dirty and history snapshot comparisons (default: identity).
- `compare` deep-compares snapshots (default: JSON.stringify equality).
- `historyLimit` bounds the number of frames (default 50).
- `reset` redefines the initial snapshot and clears history to a single frame.
- `setValue`/`onChange` push frames when `sanitize(next)` differs from the top snapshot; redo tail is truncated on new pushes.

## Integration in `products.boms-fullzoom.tsx`

- We provide a `sanitize` that:
  - Removes trailing blanks per product
  - Drops derived fields (childName, type, supplier)
  - Normalizes types (trimmed `childSku`, numeric `quantity`)
- We use `controller.value` as `rows`, and `controller.setValue` where we previously used `setRows`.
- We call `controller.reset(normalizeRows(initialRows))` on loader changes and in Cancel.
- `formState.isDirty` is now `controller.state.isDirty`.
- Lookup flow swaps to `controller.getValue()` + `controller.setValue()`.

## File changes

- Fork:
  - `packages/react-datasheet-grid/src/hooks/useDataSheetController.ts` (new)
  - `packages/react-datasheet-grid/src/index.tsx` export added
- App:
  - `app/modules/product/routes/products.boms-fullzoom.tsx` refactor to use the controller

## Open Items / TODOS

- Build & verify end-to-end
  - Ensure `npm run build` passes at root (fork builds already pass).
  - Exercise Save/Cancel and ensure `isDirty` toggles as expected.
- Keyboard bindings (optional)
  - Add Cmd+Z / Cmd+Shift+Z handlers scoped to the grid to call `controller.undo()` / `controller.redo()`.
- Docs (optional)
  - Add a short README section in the fork documenting `useDataSheetController`.
- Tests (optional)
  - Add unit tests for: snapshot compare via `sanitize`, history trimming, reset semantics.
- Performance (watch)
  - If large sheets show perf issues, consider replacing JSON stringify with a stable hasher or structured deep equal.

## Notes

- The `sanitize` used in BOM ignores derived columns and padding so dirtiness reflects meaningful changes only.
- Undo/redo is snapshot-based; we can later optimize to op-based if needed.
