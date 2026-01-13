import type { CellChange, Id } from "@silevis/reactgrid";

type EnsureRowsArgs<Row> = {
  changes: CellChange[];
  rows: Row[];
  rowIndexById: Map<Id, number>;
  shouldGrowForChange: (
    change: CellChange,
    rowIndex: number | null,
    row: Row | null
  ) => boolean;
  resolveRowIndexFromId?: (rowId: Id) => number | null;
  appendRows?: (
    count: number,
    context: { anchorRowIndex: number | null; maxTargetRowIndex: number }
  ) => Row[];
  applyGrowth?: (args: {
    rows: Row[];
    count: number;
    maxTargetRowIndex: number;
    anchorRowIndex: number | null;
  }) => Row[];
};

type EnsureRowsResult<Row> = {
  didGrow: boolean;
  nextRows: Row[];
  addedCount: number;
  maxTargetRowIndex: number;
  anchorRowIndex: number | null;
};

export function parseRowIndexFromId(rowId: Id): number | null {
  if (typeof rowId !== "string") return null;
  const match = rowId.match(/^row:(\d+)/);
  if (!match) return null;
  const idx = Number(match[1]);
  return Number.isFinite(idx) ? idx : null;
}

export function ensureRowsForCellChanges<Row>({
  changes,
  rows,
  rowIndexById,
  shouldGrowForChange,
  resolveRowIndexFromId = parseRowIndexFromId,
  appendRows,
  applyGrowth,
}: EnsureRowsArgs<Row>): EnsureRowsResult<Row> {
  let maxTargetRowIndex = -1;
  let anchorRowIndex: number | null = null;
  for (const change of changes) {
    if (change.rowId === "header") continue;
    const rowIndex =
      rowIndexById.get(change.rowId) ??
      (resolveRowIndexFromId ? resolveRowIndexFromId(change.rowId) : null);
    if (rowIndex == null || rowIndex < 0) continue;
    const row = rowIndex < rows.length ? rows[rowIndex] : null;
    if (!shouldGrowForChange(change, rowIndex, row)) continue;
    if (anchorRowIndex == null) anchorRowIndex = rowIndex;
    if (rowIndex > maxTargetRowIndex) maxTargetRowIndex = rowIndex;
  }

  const required = maxTargetRowIndex + 1 - rows.length;
  if (required <= 0) {
    return {
      didGrow: false,
      nextRows: rows,
      addedCount: 0,
      maxTargetRowIndex,
      anchorRowIndex,
    };
  }

  let nextRows = rows;
  if (applyGrowth) {
    nextRows = applyGrowth({
      rows,
      count: required,
      maxTargetRowIndex,
      anchorRowIndex,
    });
  } else if (appendRows) {
    const appended = appendRows(required, {
      anchorRowIndex,
      maxTargetRowIndex,
    });
    nextRows = rows.concat(appended);
  }

  return {
    didGrow: nextRows.length !== rows.length,
    nextRows,
    addedCount: nextRows.length - rows.length,
    maxTargetRowIndex,
    anchorRowIndex,
  };
}
