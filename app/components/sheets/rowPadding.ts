export const DEFAULT_MIN_ROWS = 40;
export const DEFAULT_ROW_HEIGHT = 36; // px, visual estimate for RDG rows

// Pad a list to a minimum number of rows by appending blanks created from the
// last row's structural fields. Safe for display; callers decide how to handle
// edits/saves of the padded rows.
export function padToMinRows<T>(
  list: T[],
  minRows: number,
  createFromLast: (last: T | undefined, index: number) => T
): T[] {
  const out = list.slice();
  const need = Math.max(0, (minRows || 0) - out.length);
  if (need <= 0) return out;
  const last = out[out.length - 1];
  for (let i = 0; i < need; i++) out.push(createFromLast(last, i));
  return out;
}

// Compute a conservative minimum row count to visually fill a given height.
// Keep a floor to avoid tiny grids causing odd behavior.
export function minRowsForHeight(
  height: number,
  rowHeight: number = DEFAULT_ROW_HEIGHT,
  floor: number = DEFAULT_MIN_ROWS
): number {
  if (!height || height <= 0 || !rowHeight) return floor;
  const approx = Math.ceil(height / rowHeight) + 1; // small buffer
  return Math.max(floor, approx);
}
