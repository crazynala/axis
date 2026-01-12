# Sheet Conventions (Axis)

## Routing
- Sheet routes end with `/sheet` or include `-sheet`.
- Legacy `*fullzoom*` routes redirect to the corresponding sheet route.
- Sheet routes suppress the main AppShell in `app/root.tsx`.

## Layout Primitives (required)
- `SheetShell`: viewport-based height, shared header chrome, overflow hidden, stable gutter.
- `SheetHeader`: shared Google-Sheets-ish header used by all sheet routes.
- `SheetFrame`: fixed height, flex column, min-height: 0, overflow hidden.
- `SheetGrid`: thin wrapper over `react-datasheet-grid` with controller adapters.
- `SheetModal`: modal preset for sheet grids (body overflow hidden, stable gutter).

## Scroll Ownership
- Exactly one vertical scroll owner per sheet view.
- In full-page sheets, the grid owns scroll (parent containers are overflow hidden).
- Any header/footer UI must be reserved via `SheetFrame` top/bottom reserves.

## Header Contract
- No per-route bespoke headers; `SheetShell` always renders `SheetHeader`.
- `SheetShell` props: `title`, `subtitle?`, `controller?`, `backTo?`, `onDone?`, `saveState?`, `showStatus?`, `rightExtra?`.
- The header status uses `controller.state.isDirty` when available, otherwise the global form context.
- Done behavior: `onDone` first, then `backTo`, then `navigate(-1)`.
- Debug: Sheets show a Debug drawer toggle for dev/admin users (flags live there).

## Hotkeys (Undo/Redo)
- `SheetGrid` installs a capture-phase `window` listener while mounted.
- It ignores events from `INPUT`, `TEXTAREA`, `SELECT`, or `contentEditable` targets.
- When handled, it must `preventDefault` and `stopPropagation`.
- Header Undo/Redo buttons must call the same controller trigger path as hotkeys.

## Controller Adapters
- Use `adaptDataGridController` for `useDataGrid`.
- Use `adaptRdgController` for `useDataSheetController`.
- Pass adapters to `SheetGrid` so sheets are controller-agnostic.

## Regression Checklist
- Layout: no page/body scrollbars on sheet routes; grid is the only scroll owner.
- Layout: no header/footer clipping; no bottom dead space; grid fills the corridor.
- Hotkeys: Cmd/Ctrl+Z works even when grid is not focused.
- Hotkeys: Cmd/Ctrl+Z in a text input does not get intercepted.
- Buttons: Undo/Redo buttons mirror hotkey behavior and preserve selection restore.
- Status: Dirty flips to "Unsaved" and returns to "Saved" after save/reset.
- BOM sheet: paste -> undo works even with async SKU lookup patches.
