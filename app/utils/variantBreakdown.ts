import type { ReactNode } from "react";

export type VariantSource = {
  id: number | string | null;
  name?: string | null;
  variants?: Array<string | null> | null;
};

export type VariantGroupLine<T> = {
  item: T;
  key: string;
  cells: number[];
  total: number;
};

export type VariantGroup<T> = {
  key: string;
  title: string;
  labels: string[];
  lines: VariantGroupLine<T>[];
  totals: number[];
  totalSum: number;
};

export function groupVariantBreakdowns<T>(
  items: T[] | undefined | null,
  options: {
    getBreakdown: (item: T) => Array<number | string | null | undefined> | null | undefined;
    getVariant: (item: T) => VariantSource | null | undefined;
    getItemKey?: (item: T, index: number) => string | number;
  }
): VariantGroup<T>[] {
  if (!items || !items.length) return [];
  const groups = new Map<string, VariantGroup<T>>();
  items.forEach((item, index) => {
    const rawBreakdown = normalizeBreakdown(options.getBreakdown(item));
    if (!rawBreakdown.length) return;
    const variant = options.getVariant(item);
    const baseLabels = normalizeLabels(variant?.variants, rawBreakdown.length);
    const groupKey = buildVariantGroupKey(variant);
    const title = buildVariantGroupTitle(variant);
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        title,
        labels: [...baseLabels],
        lines: [],
        totals: Array(baseLabels.length).fill(0),
        totalSum: 0,
      };
      groups.set(groupKey, group);
    } else {
      ensureLabelCapacity(group, rawBreakdown.length);
    }
    const padded = padBreakdown(rawBreakdown, group.labels.length);
    const total = sumArray(padded);
    const lineKeyValue = options.getItemKey
      ? options.getItemKey(item, index)
      : `${group.lines.length}`;
    const lineKey = String(lineKeyValue);
    group.lines.push({ item, key: lineKey, cells: padded, total });
    for (let i = 0; i < padded.length; i += 1) {
      group.totals[i] += padded[i];
    }
    group.totalSum += total;
  });
  return Array.from(groups.values());
}

export type VariantBreakdownRenderOpts<T> = {
  groups: VariantGroup<T>[];
  renderLineLabel: (item: T, index: number) => ReactNode;
  formatValue?: (value: number) => ReactNode;
  lineHeader?: ReactNode;
};

function normalizeBreakdown(values?: Array<number | string | null | undefined> | null) {
  if (!values) return [] as number[];
  const arr: number[] = [];
  values.forEach((value) => {
    const num = Number(value ?? 0);
    arr.push(Number.isFinite(num) ? num : 0);
  });
  return arr;
}

function normalizeLabels(values?: Array<string | null> | null, fallbackLength = 1) {
  const labels = (values || [])
    .map((label) => (label ?? "").trim())
    .filter((label) => label.length > 0);
  while (labels.length < fallbackLength) {
    labels.push(`Slot ${labels.length + 1}`);
  }
  return labels.length ? labels : [`Slot 1`];
}

function buildVariantGroupKey(source?: VariantSource | null) {
  if (!source) return "variant-none";
  if (source.id != null) return `variant-${source.id}`;
  if (source.name) return `variant-name-${source.name}`;
  return "variant-none";
}

function buildVariantGroupTitle(source?: VariantSource | null) {
  if (!source) return "No Variant Set";
  if (source.name) return source.name;
  if (source.id != null) return `Variant Set ${source.id}`;
  return "No Variant Set";
}

function ensureLabelCapacity<T>(group: VariantGroup<T>, requiredLength: number) {
  if (requiredLength <= group.labels.length) return;
  const start = group.labels.length;
  for (let i = start; i < requiredLength; i += 1) {
    group.labels.push(`Slot ${i + 1}`);
    group.totals.push(0);
    group.lines.forEach((line) => {
      while (line.cells.length < group.labels.length) {
        line.cells.push(0);
      }
    });
  }
}

function padBreakdown(values: number[], length: number) {
  const padded = values.slice(0, length);
  while (padded.length < length) {
    padded.push(0);
  }
  return padded;
}

function sumArray(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function resolveVariantSourceFromLine(line: any): VariantSource | null {
  if (!line || typeof line !== "object") return null;
  return (
    line.variantSet ||
    line.assembly?.variantSet ||
    line.product?.variantSet ||
    null
  );
}