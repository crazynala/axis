# Glide Sheet Checklist

Use this checklist when migrating a sheet surface to Glide Data Grid.

Required behavior
- Copy: select 2x2, paste into Notes/Excel as TSV
- Paste: multi-row paste fills rows; adds drafts as needed
- Undo/redo: revert edits and reapply cleanly
- Save: existing rows update; drafts create
- Drafts: stable ids, trailing blank ensured (grouped sheets)
- Column picker: show/hide columns with persistence
- Column widths: resize + persist in localStorage
- Dark mode: header bands, row headers, editable/read-only contrast

Common patterns
- Row ids: `line:<id>` for persisted, `draft:<uuid>` for new
- For grouped sheets: header rows use `hdr:<groupKey>`
- Patch model: collect `before`/`after` snapshots for undo/redo
- Paste: map by selection anchor, extend drafts if needed
- Derived fields: patch-only, never overwrite user edits

Smoke tests per sheet
1) Copy block -> paste into Notes
2) Paste 5 rows -> rows extend
3) Undo -> values revert, drafts normalize
4) Redo -> values restore, derived fills rerun
5) Save -> refresh persists
