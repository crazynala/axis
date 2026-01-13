import type { Id, Range } from "@silevis/reactgrid";

type RangeLike = Range & {
  rows?: Array<{ rowId: Id; idx: number }>;
  columns?: Array<{ columnId: Id; idx: number }>;
};

export type SelectedCellLocation = {
  rowId: Id;
  columnId: Id;
  rowIdx: number;
  colIdx: number;
};

export const collectSelectedCellLocations = (
  selectedRanges: Array<RangeLike> | null | undefined
): SelectedCellLocation[] => {
  if (!selectedRanges?.length) return [];
  const out: SelectedCellLocation[] = [];
  const seen = new Set<string>();
  for (const range of selectedRanges) {
    const rows = Array.isArray(range?.rows) ? range.rows : [];
    const columns = Array.isArray(range?.columns) ? range.columns : [];
    if (!rows.length || !columns.length) continue;
    for (const row of rows) {
      for (const column of columns) {
        const rowId = row?.rowId;
        const columnId = column?.columnId;
        if (rowId == null || columnId == null) continue;
        const key = `${rowId}:${columnId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          rowId,
          columnId,
          rowIdx: row.idx,
          colIdx: column.idx,
        });
      }
    }
  }
  return out;
};
