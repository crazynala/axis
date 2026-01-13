import type { SheetColumnDef } from "~/base/sheets/sheetSpec";

export function computeSheetColumnWidths<Row>(options: {
  columns: SheetColumnDef<Row>[];
  widthPresetByKey?: Record<string, string>;
  containerWidthPx: number;
}) {
  const { columns, widthPresetByKey = {}, containerWidthPx } = options;
  const baseWidths = columns.map((col) => {
    const presetId = widthPresetByKey[col.key];
    const preset = col.widthPresets?.find((p) => p.id === presetId);
    const base =
      (preset && typeof preset.px === "number" ? preset.px : undefined) ??
      col.baseWidthPx ??
      160;
    return { key: col.key, base, grow: col.grow };
  });
  const baseTotal = baseWidths.reduce((sum, item) => sum + item.base, 0);
  if (baseTotal >= containerWidthPx || containerWidthPx <= 0) {
    return Object.fromEntries(baseWidths.map((item) => [item.key, item.base]));
  }
  const slack = containerWidthPx - baseTotal;
  const growItems = baseWidths
    .map((item) => {
      const weight =
        typeof item.grow === "number"
          ? item.grow
          : item.grow === true
          ? 1
          : 0;
      return { ...item, weight };
    })
    .filter((item) => item.weight > 0);
  if (!growItems.length) {
    return Object.fromEntries(baseWidths.map((item) => [item.key, item.base]));
  }
  const totalWeight = growItems.reduce((sum, item) => sum + item.weight, 0);
  let remaining = slack;
  const widthByKey: Record<string, number> = {};
  const growIndexByKey = new Map(
    growItems.map((item, idx) => [item.key, idx] as const)
  );
  for (const item of baseWidths) {
    const growIndex = growIndexByKey.get(item.key);
    if (growIndex == null) {
      widthByKey[item.key] = item.base;
      continue;
    }
    const growItem = growItems[growIndex];
    const share =
      growIndex === growItems.length - 1
        ? remaining
        : Math.round((slack * growItem.weight) / totalWeight);
    widthByKey[item.key] = item.base + share;
    remaining -= share;
  }
  return widthByKey;
}
