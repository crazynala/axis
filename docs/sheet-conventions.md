# Sheet Conventions (Axis)

## Routing
- Sheet routes end with `/sheet` or include `-sheet`.
- Legacy `*fullzoom*` routes redirect to the corresponding sheet route.
- Sheet routes suppress the main AppShell in `app/root.tsx`.

## Layout Primitives (required)
- `SheetShell`: viewport-based height, header chrome, overflow hidden, stable gutter.
- `SheetFrame`: fixed height, flex column, min-height: 0, overflow hidden.
- `SheetGrid`: thin wrapper over `react-datasheet-grid` with controller adapters.
- `SheetModal`: modal preset for sheet grids (body overflow hidden, stable gutter).

## Scroll Ownership
- Exactly one vertical scroll owner per sheet view.
- In full-page sheets, the grid owns scroll (parent containers are overflow hidden).
- Any header/footer UI must be reserved via `SheetFrame` top/bottom reserves.

## Controller Adapters
- Use `adaptDataGridController` for `useDataGrid`.
- Use `adaptRdgController` for `useDataSheetController`.
- Pass adapters to `SheetGrid` so sheets are controller-agnostic.
