export type GroupKey = string | number | null | undefined;

export type GroupBlankFactory<T> = (args: {
  groupKey: GroupKey;
  template: T;
  groupIndex: number;
}) => T | null;

export function withGroupTrailingBlank<T>(
  rows: T[],
  getKey: (row: T, index: number) => GroupKey,
  createBlank: GroupBlankFactory<T>
): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return rows.slice();
  const out: T[] = [];
  let currentKey = getKey(rows[0], 0);
  let groupIndex = 0;
  let last = rows[0];
  out.push(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const key = getKey(row, i);
    if (key !== currentKey) {
      const blank = createBlank({
        groupKey: currentKey,
        template: last,
        groupIndex,
      });
      if (blank) out.push(blank);
      currentKey = key;
      groupIndex += 1;
    }
    out.push(row);
    last = row;
  }
  const tail = createBlank({
    groupKey: currentKey,
    template: last,
    groupIndex,
  });
  if (tail) out.push(tail);
  return out;
}
