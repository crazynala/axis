import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import {
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { useInitGlobalFormContext } from "@aa/timber";
import { SheetShell } from "~/components/sheets/SheetShell";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { useElementSize } from "@mantine/hooks";
import {
  Button,
  Group,
  useMantineColorScheme,
  useMantineTheme,
} from "@mantine/core";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { productSpec } from "~/modules/product/spec";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import type { SheetColumnSelectionState } from "~/base/sheets/useSheetColumns";
import type { DebugExplainPayload } from "~/modules/debug/types";
import {
  DataEditor,
  GridCellKind,
  type GridCell,
  type GridColumn,
} from "@glideapps/glide-data-grid";
import type { SheetColumnDef, SheetViewSpec } from "~/base/sheets/sheetSpec";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prismaBase } from "~/utils/prisma.server";
import { applyBomBatch } from "~/modules/product/services/productBom.server";

type BomRowBase = {
  productId: number;
  productSku: string;
  productName: string;
  id: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
};

type HeaderRow = {
  kind: "header";
  rowId: string;
  productId: number;
  productSku: string;
  productName: string;
};

type LineRow = BomRowBase & {
  kind: "line";
  rowId: string;
};

type DraftRow = BomRowBase & {
  kind: "draft";
  rowId: string;
  draftId: string;
};

type VisibleRow = HeaderRow | LineRow | DraftRow;

type DraftsByProductId = Record<number, DraftRow[]>;

// Row kind mapping:
// - header: editable none; derived none; primary none
// - line: editable childSku/activityUsed/quantity; derived childName/type/supplier; primary allowed (if >1 line)
// - draft: editable childSku/activityUsed/quantity; derived childName/type/supplier; primary not shown
type RowSnapshot = {
  rowId: string;
  kind: "line" | "draft";
  productId: number;
  row: LineRow | DraftRow | null;
};

type PatchBatch = {
  before: RowSnapshot[];
  after: RowSnapshot[];
  primaryBefore?: Record<number, number>;
  primaryAfter?: Record<number, number>;
};

const EDITABLE_KEYS = new Set(["childSku", "quantity", "activityUsed"]);
const FILL_KEYS = new Set(["quantity", "activityUsed"]);
const PRIMARY_COLUMN = { key: "primary", label: "Primary" };
const PRODUCT_COLUMN = { key: "product", label: "Product" };
const PRODUCT_COLUMN_DEF: SheetColumnDef<BomRowBase> = {
  key: "product",
  label: "Product",
  defaultVisible: true,
  hideable: false,
  group: "Base",
};
const DERIVED_KEYS = new Set(["childName", "type", "supplier", "activityUsed"]);
const IS_DEV = process.env.NODE_ENV !== "production";

const ensureProductFirst = (keys: string[]) => {
  const next = keys.filter((key) => key !== "product");
  return ["product", ...next];
};

const normalizeOrder = (order: string[], allKeys: string[]) => {
  const allowed = new Set(allKeys);
  const cleaned = order.filter((key) => allowed.has(key));
  const missing = allKeys.filter((key) => !cleaned.includes(key));
  return ensureProductFirst(cleaned.concat(missing));
};

const moveKeyByIndex = (keys: string[], from: number, to: number) => {
  if (from === to) return keys;
  const next = keys.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const mergeVisibleOrder = (
  currentOrder: string[],
  newVisibleOrder: string[],
  allKeys: string[]
) => {
  const baseOrder = normalizeOrder(currentOrder, allKeys);
  const visibleSet = new Set(newVisibleOrder);
  const hiddenSet = new Set(allKeys.filter((key) => !visibleSet.has(key)));
  const result: string[] = [];
  let visibleIndex = 0;
  baseOrder.forEach((key) => {
    if (hiddenSet.has(key)) {
      result.push(key);
      return;
    }
    const nextKey = newVisibleOrder[visibleIndex];
    if (nextKey) {
      result.push(nextKey);
      visibleIndex += 1;
    }
  });
  for (; visibleIndex < newVisibleOrder.length; visibleIndex += 1) {
    const key = newVisibleOrder[visibleIndex];
    if (!result.includes(key)) result.push(key);
  }
  return ensureProductFirst(result);
};

const buildColumnsByGroup = <Row,>(columns: SheetColumnDef<Row>[]) => {
  const map = new Map<string, SheetColumnDef<Row>[]>();
  const order: string[] = [];
  for (const col of columns) {
    const group = col.group || "Columns";
    if (!map.has(group)) {
      map.set(group, []);
      order.push(group);
    }
    map.get(group)?.push(col);
  }
  return order.map((group) => [group, map.get(group) || []] as const);
};

export async function loader(args: LoaderFunctionArgs) {
  const startedAt = Date.now();
  const url = new URL(args.request.url);
  const ids = (url.searchParams.get("ids") || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));
  if (!ids.length) {
    return json({ rows: [], products: [] });
  }
  const productsRaw = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      sku: true,
      name: true,
      primaryProductLineId: true,
      productLines: {
        select: {
          id: true,
          quantity: true,
          activityUsed: true,
          child: {
            select: {
              sku: true,
              name: true,
              type: true,
              supplier: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  const productsById = new Map(productsRaw.map((product) => [product.id, product]));
  const products = ids
    .map((id) => productsById.get(id))
    .filter(Boolean)
    .concat(productsRaw.filter((product) => !ids.includes(product.id)));
  const rows: BomRowBase[] = [];
  products.forEach((product) => {
    const productSku = product.sku || "";
    const productName = product.name || "";
    (product.productLines || []).forEach((line) => {
      rows.push({
        productId: product.id,
        productSku,
        productName,
        id: line.id ?? null,
        childSku: line.child?.sku || "",
        childName: line.child?.name || "",
        activityUsed: String(line.activityUsed || ""),
        type: line.child?.type ? String(line.child.type) : "",
        supplier: line.child?.supplier?.name || "",
        quantity:
          line.quantity == null ? "" : Number(line.quantity) || 0,
      });
    });
  });
  if (IS_DEV) {
    const elapsed = Date.now() - startedAt;
    console.info(`[boms-sheet-glide] loader ${elapsed}ms`);
  }
  return json({
    rows,
    products: products.map((product) => ({
      id: product.id,
      sku: product.sku || "",
      name: product.name || "",
      primaryProductLineId: product.primaryProductLineId ?? null,
    })),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json().catch(() => null);
  const intent = String(body?._intent || "");
  if (intent !== "products.boms.batchSave") {
    return json({ ok: false, error: "Unknown intent" }, { status: 400 });
  }
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const primaryLineByProductId = body?.primaryLineByProductId || {};
  const rowsByProduct = new Map<number, BomRowBase[]>();
  rows.forEach((row: BomRowBase) => {
    const productId = Number(row?.productId || 0);
    if (!productId) return;
    const list = rowsByProduct.get(productId) || [];
    list.push(row);
    rowsByProduct.set(productId, list);
  });
  const lineIds = rows
    .map((row: BomRowBase) => Number(row?.id))
    .filter((id) => Number.isFinite(id));
  const existingLines = lineIds.length
    ? await prismaBase.productLine.findMany({
        where: { id: { in: lineIds } },
        select: {
          id: true,
          child: { select: { sku: true } },
        },
      })
    : [];
  const existingSkuByLineId = new Map<number, string>(
    existingLines.map((line) => [line.id, line.child?.sku || ""])
  );
  let created = 0;
  let updated = 0;
  let deleted = 0;
  const unknownSkus: string[] = [];
  for (const [productId, productRows] of rowsByProduct.entries()) {
    const creates: Array<{ childSku: string; quantity?: number; activityUsed?: string | null }> = [];
    const updates: Array<{ id: number; quantity?: number; activityUsed?: string | null }> = [];
    const deletes: number[] = [];
    productRows.forEach((row) => {
      const id = row.id != null ? Number(row.id) : null;
      const childSku = String(row.childSku || "").trim();
      const quantity =
        row.quantity === "" || row.quantity == null
          ? undefined
          : Number(row.quantity) || 0;
      const activityUsed = row.activityUsed ? String(row.activityUsed) : null;
      if (!id) {
        if (childSku) {
          creates.push({ childSku, quantity, activityUsed });
        }
        return;
      }
      if (!childSku) {
        deletes.push(id);
        return;
      }
      const existingSku = existingSkuByLineId.get(id) || "";
      if (existingSku && existingSku !== childSku) {
        deletes.push(id);
        creates.push({ childSku, quantity, activityUsed });
        return;
      }
      updates.push({ id, quantity, activityUsed });
    });
    if (!creates.length && !updates.length && !deletes.length) continue;
    const result = await applyBomBatch(productId, updates, creates, deletes);
    created += result.created || 0;
    updated += result.updated || 0;
    deleted += result.deleted || 0;
    if (Array.isArray(result.unknownSkus)) {
      unknownSkus.push(...result.unknownSkus);
    }
    const primaryLineIdRaw = primaryLineByProductId?.[productId];
    const primaryLineId =
      primaryLineIdRaw == null ? null : Number(primaryLineIdRaw);
    if (!Number.isFinite(primaryLineId)) {
      await prismaBase.product.update({
        where: { id: productId },
        data: { primaryProductLineId: null },
      });
    } else {
      const exists = await prismaBase.productLine.findFirst({
        where: { id: Number(primaryLineId), parentId: productId },
        select: { id: true, child: { select: { type: true } } },
      });
      const isFabric =
        String(exists?.child?.type || "").toLowerCase() === "fabric";
      await prismaBase.product.update({
        where: { id: productId },
        data: {
          primaryProductLineId:
            exists && isFabric ? Number(primaryLineId) : null,
        },
      });
    }
  }
  return json({ ok: true, created, updated, deleted, unknownSkus });
}

const resolveText = (value: unknown) =>
  value == null ? "" : String(value);

const isFabricType = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase() === "fabric";

const isBlankDraft = (row: DraftRow) =>
  !String(row.childSku || "").trim() &&
  !String(row.childName || "").trim() &&
  !String(row.type || "").trim() &&
  !String(row.supplier || "").trim() &&
  !String(row.activityUsed || "").trim() &&
  !String(row.quantity || "").trim();

const buildRowId = (row: { id: number | null; draftId?: string }) => {
  if (row.draftId) return `draft:${row.draftId}`;
  if (row.id != null) return `line:${row.id}`;
  return `line:unknown`;
};

const createDraftId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `draft-${Math.random().toString(36).slice(2)}`;
};

const blankDraft = (
  productId: number,
  productSku: string,
  productName: string
): DraftRow => ({
  kind: "draft",
  rowId: "",
  draftId: createDraftId(),
  productId,
  productSku,
  productName,
  id: null,
  childSku: "",
  childName: "",
  activityUsed: "",
  type: "",
  supplier: "",
  quantity: "",
});

const usageOptions: Array<{ label: string; value: string }> = [
  { label: "", value: "" },
  { label: "Cut", value: "cut" },
  { label: "Sew", value: "sew" },
  { label: "Finish", value: "finish" },
  { label: "Make", value: "make" },
  { label: "Wash", value: "wash" },
  { label: "Embroidery", value: "embroidery" },
  { label: "Dye", value: "dye" },
];

export default function ProductsBomsSheetGlide() {
  const [searchParams] = useSearchParams();
  const { rows: initialRows, products } = useLoaderData<{
    rows: BomRowBase[];
    products: Array<{ id: number; sku: string; name: string; primaryProductLineId?: number | null }>;
  }>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [primaryLineByProductId, setPrimaryLineByProductId] = useState<
    Record<number, number>
  >(() => {
    const initial: Record<number, number> = {};
    products.forEach((product) => {
      const primaryId = Number(product.primaryProductLineId);
      if (Number.isFinite(primaryId)) {
        initial[product.id] = primaryId;
      }
    });
    return initial;
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dropdownRenderer, setDropdownRenderer] = useState<any>(null);
  const [hoverProbe, setHoverProbe] = useState<any>(null);
  const renderStartRef = useRef<number | null>(null);
  if (renderStartRef.current == null) {
    renderStartRef.current =
      typeof performance !== "undefined" ? performance.now() : Date.now();
  }
  const firstPaintLoggedRef = useRef(false);
  const { ref: gridRef, width: gridWidth, height: gridHeight } =
    useElementSize();
  const { colorScheme } = useMantineColorScheme();
  const mantineTheme = useMantineTheme();
  const [widthsByKey, setWidthsByKey] = useState<Record<string, number>>({});
  const persistTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);
  useEffect(() => {
    if (!isClient) return;
    let mounted = true;
    import("@glideapps/glide-data-grid-cells")
      .then((mod) => {
        if (!mounted) return;
        setDropdownRenderer(() => mod.DropdownCell);
      })
      .catch(() => {
        // ignore missing optional renderer
      });
    return () => {
      mounted = false;
    };
  }, [isClient]);
  useEffect(() => {
    if (!IS_DEV || renderStartRef.current == null) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const elapsed = Math.round(now - renderStartRef.current);
    console.info(`[boms-sheet-glide] mount ${elapsed}ms`);
  }, []);
  const viewSpec = productSpec.sheet?.views["boms"];
  if (!viewSpec) {
    return null;
  }
  const viewSpecWithProduct = useMemo<SheetViewSpec<BomRowBase>>(() => {
    const hasProduct = viewSpec.columns.some((col) => col.key === "product");
    const columns = hasProduct
      ? viewSpec.columns.map((col) =>
          col.key === "product"
            ? { ...col, hideable: false, defaultVisible: true }
            : col
        )
      : [PRODUCT_COLUMN_DEF, ...viewSpec.columns];
    const defaultColumns = viewSpec.defaultColumns?.length
      ? Array.from(new Set(["product", ...viewSpec.defaultColumns]))
      : undefined;
    return { ...viewSpec, columns, defaultColumns };
  }, [viewSpec]);
  const allColumnKeys = useMemo(
    () => viewSpecWithProduct.columns.map((col) => col.key),
    [viewSpecWithProduct.columns]
  );
  const defaultVisibleKeys = useMemo(() => {
    const base = viewSpecWithProduct.defaultColumns?.length
      ? viewSpecWithProduct.defaultColumns
      : viewSpecWithProduct.columns.map((col) => col.key);
    const normalized = base.filter((key) => allColumnKeys.includes(key));
    return ensureProductFirst(normalized);
  }, [allColumnKeys, viewSpecWithProduct.columns, viewSpecWithProduct.defaultColumns]);
  const defaultOrder = useMemo(
    () => ensureProductFirst(viewSpecWithProduct.columns.map((col) => col.key)),
    [viewSpecWithProduct.columns]
  );
  const columnStorageKey = "axis:glide:productsBomsSheet:columns:v2";
  const [columnOrder, setColumnOrder] = useState<string[]>(defaultOrder);
  const [hiddenColumnKeys, setHiddenColumnKeys] = useState<string[]>([]);

  const returnTo = useMemo(() => {
    const raw = searchParams.get("returnTo");
    if (!raw) return "/products";
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }, [searchParams]);

  const widthsStorageKey = "axis:glide:cols:v1:products.boms.sheet:multi";
  useEffect(() => {
    if (!isClient) return;
    try {
      const stored = window.localStorage.getItem(widthsStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object") {
        setWidthsByKey(parsed);
      }
    } catch {
      // ignore storage errors
    }
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          widthsStorageKey,
          JSON.stringify(widthsByKey)
        );
      } catch {
        // ignore storage errors
      }
    }, 200);
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
      }
    };
  }, [isClient, widthsByKey]);

  useEffect(() => {
    if (!isClient) return;
    try {
      const stored = window.localStorage.getItem(columnStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed !== "object") return;
      const nextOrder = Array.isArray(parsed.order)
        ? normalizeOrder(parsed.order, allColumnKeys)
        : normalizeOrder(defaultOrder, allColumnKeys);
      const hidden =
        Array.isArray(parsed.hidden) && parsed.hidden.length
          ? parsed.hidden.filter(
              (key: string) => allColumnKeys.includes(key) && key !== "product"
            )
          : [];
      setColumnOrder(nextOrder);
      setHiddenColumnKeys(hidden);
    } catch {
      // ignore storage errors
    }
  }, [allColumnKeys, columnStorageKey, defaultOrder, isClient]);

  useEffect(() => {
    if (!isClient) return;
    try {
      window.localStorage.setItem(
        columnStorageKey,
        JSON.stringify({
          order: columnOrder,
          hidden: hiddenColumnKeys.filter((key) => key !== "product"),
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [columnOrder, columnStorageKey, hiddenColumnKeys, isClient]);

  const productMetaById = useMemo(() => {
    const map = new Map<number, { sku: string; name: string }>();
    initialRows.forEach((row) => {
      if (!map.has(row.productId)) {
        map.set(row.productId, {
          sku: row.productSku || "",
          name: row.productName || "",
        });
      }
    });
    (products || []).forEach((product) => {
      if (!map.has(product.id)) {
        map.set(product.id, {
          sku: product.sku || "",
          name: product.name || "",
        });
      }
    });
    return map;
  }, [initialRows, products]);

  const idsInOrder = useMemo(() => {
    return (searchParams.get("ids") || "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value));
  }, [searchParams]);

  const productOrder = useMemo(() => {
    const seen = new Set<number>();
    const order: number[] = [];
    idsInOrder.forEach((id) => {
      if (seen.has(id)) return;
      if (!productMetaById.has(id)) return;
      seen.add(id);
      order.push(id);
    });
    productMetaById.forEach((_, id) => {
      if (seen.has(id)) return;
      seen.add(id);
      order.push(id);
    });
    return order;
  }, [idsInOrder, productMetaById]);


  const initialLines = useMemo<LineRow[]>(() => {
    return initialRows.map((row) => ({
      ...row,
      kind: "line",
      rowId: buildRowId({ id: row.id, draftId: undefined }),
    }));
  }, [initialRows]);

  const initialDrafts = useMemo<DraftsByProductId>(() => {
    const drafts: DraftsByProductId = {};
    productOrder.forEach((productId) => {
      const meta = productMetaById.get(productId) ?? {
        sku: "",
        name: "",
      };
      const draft = blankDraft(productId, meta.sku, meta.name);
      draft.rowId = buildRowId(draft);
      drafts[productId] = [draft];
    });
    return drafts;
  }, [productMetaById, productOrder]);

  const [gridState, setGridState] = useState<{
    lines: LineRow[];
    draftsByProductId: DraftsByProductId;
  }>(() => ({
    lines: initialLines,
    draftsByProductId: initialDrafts,
  }));

  useEffect(() => {
    setGridState({ lines: initialLines, draftsByProductId: initialDrafts });
  }, [initialDrafts, initialLines]);

  const historyRef = useRef<{ past: PatchBatch[]; future: PatchBatch[] }>({
    past: [],
    future: [],
  });

  useSheetDirtyPrompt();

  const linesByProductId = useMemo(() => {
    const map = new Map<number, LineRow[]>();
    gridState.lines.forEach((line) => {
      const list = map.get(line.productId);
      if (list) {
        list.push(line);
      } else {
        map.set(line.productId, [line]);
      }
    });
    return map;
  }, [gridState.lines]);
  useEffect(() => {
    setPrimaryLineByProductId((prev) => {
      const next: Record<number, number> = {};
      Object.entries(prev).forEach(([pid, lineId]) => {
        const productId = Number(pid);
        const lines = linesByProductId.get(productId) || [];
        if (
          lines.some(
            (line) =>
              Number(line.id) === Number(lineId) && isFabricType(line.type)
          )
        ) {
          next[productId] = Number(lineId);
        }
      });
      linesByProductId.forEach((lines, productId) => {
        if (next[productId]) return;
        const firstFabric = lines.find((line) => isFabricType(line.type));
        const fallbackId = firstFabric?.id ?? null;
        if (fallbackId != null) next[productId] = Number(fallbackId);
      });
      return next;
    });
  }, [linesByProductId]);

  const visibleRows = useMemo<VisibleRow[]>(() => {
    const rows: VisibleRow[] = [];
    productOrder.forEach((productId) => {
      const meta = productMetaById.get(productId) ?? { sku: "", name: "" };
      rows.push({
        kind: "header",
        rowId: `hdr:${productId}`,
        productId,
        productSku: meta.sku,
        productName: meta.name,
      });
      const lines = linesByProductId.get(productId) || [];
      lines.forEach((line) => rows.push(line));
      const drafts = gridState.draftsByProductId[productId] || [];
      drafts.forEach((draft) => rows.push(draft));
    });
    return rows;
  }, [gridState.draftsByProductId, linesByProductId, productMetaById, productOrder]);

  useEffect(() => {
    if (!IS_DEV) return;
    if (firstPaintLoggedRef.current) return;
    if (!isClient || gridWidth <= 0 || gridHeight <= 0 || visibleRows.length === 0)
      return;
    firstPaintLoggedRef.current = true;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const startedAt = renderStartRef.current ?? now;
    const elapsed = Math.round(now - startedAt);
    console.info(`[boms-sheet-glide] first paint ${elapsed}ms`);
  }, [gridHeight, gridWidth, isClient, visibleRows.length]);

  const columnDefsByKey = useMemo(
    () =>
      new Map(viewSpecWithProduct.columns.map((col) => [col.key, col] as const)),
    [viewSpecWithProduct.columns]
  );
  const productColumnDef =
    columnDefsByKey.get("product") || PRODUCT_COLUMN_DEF;
  const hiddenKeySet = useMemo(
    () => new Set(hiddenColumnKeys.filter((key) => key !== "product")),
    [hiddenColumnKeys]
  );
  const visibleColumnKeys = useMemo(
    () => columnOrder.filter((key) => !hiddenKeySet.has(key)),
    [columnOrder, hiddenKeySet]
  );
  const orderedColumnDefs = useMemo(
    () =>
      columnOrder
        .map((key) => columnDefsByKey.get(key))
        .filter(Boolean) as SheetColumnDef<BomRowBase>[],
    [columnDefsByKey, columnOrder]
  );
  const visibleColumnDefs = useMemo(
    () =>
      visibleColumnKeys
        .map((key) => columnDefsByKey.get(key))
        .filter(Boolean) as SheetColumnDef<BomRowBase>[],
    [columnDefsByKey, visibleColumnKeys]
  );
  const productColumn = useMemo(
    () => ({
      key: "product",
      label: productColumnDef.label || PRODUCT_COLUMN.label,
    }),
    [productColumnDef.label]
  );
  const gridColumns = useMemo(() => {
    const rest = visibleColumnDefs.filter((col) => col.key !== "product");
    return [productColumn, PRIMARY_COLUMN, ...rest];
  }, [productColumn, visibleColumnDefs]);

  const defaultWidthForKey = useCallback((key: string) => {
    switch (key) {
      case "primary":
        return 70;
      case "product":
        return 320;
      case "childSku":
        return 220;
      case "childName":
        return 260;
      case "supplier":
        return 180;
      case "type":
        return 120;
      case "activityUsed":
        return 120;
      case "quantity":
        return 90;
      default:
        return 140;
    }
  }, []);

  const columns = useMemo<GridColumn[]>(() => {
    return gridColumns.map((col) => ({
      id: col.key,
      title: col.label,
      width: widthsByKey[col.key] ?? defaultWidthForKey(col.key),
    }));
  }, [defaultWidthForKey, gridColumns, widthsByKey]);
  const columnsPixelWidth = useMemo(
    () => columns.reduce((sum, col) => sum + (col.width ?? 0), 0),
    [columns]
  );

  const setSelectedKeys = useCallback(
    (next: string[]) => {
      const normalized = next.filter((key) => allColumnKeys.includes(key));
      const visibleOrder = ensureProductFirst(normalized);
      const nextHidden = allColumnKeys.filter(
        (key) => !visibleOrder.includes(key) && key !== "product"
      );
      const nextOrder = mergeVisibleOrder(columnOrder, visibleOrder, allColumnKeys);
      setColumnOrder(nextOrder);
      setHiddenColumnKeys(nextHidden);
    },
    [allColumnKeys, columnOrder]
  );

  const resetToDefault = useCallback(() => {
    setColumnOrder(defaultOrder);
    const nextHidden = allColumnKeys.filter(
      (key) => !defaultVisibleKeys.includes(key) && key !== "product"
    );
    setHiddenColumnKeys(nextHidden);
  }, [allColumnKeys, defaultOrder, defaultVisibleKeys]);

  const columnSelection = useMemo<SheetColumnSelectionState<BomRowBase>>(
    () => ({
      selectedKeys: visibleColumnKeys,
      setSelectedKeys,
      resetToDefault,
      columns: orderedColumnDefs,
      selectedColumns: visibleColumnDefs,
      columnsByGroup: buildColumnsByGroup(orderedColumnDefs),
      defaultKeys: defaultVisibleKeys,
      relevanceByKey: {},
      widthPresetByKey: {},
      setWidthPreset: () => undefined,
      storageKey: columnStorageKey,
    }),
    [
      columnStorageKey,
      defaultVisibleKeys,
      orderedColumnDefs,
      resetToDefault,
      setSelectedKeys,
      visibleColumnDefs,
      visibleColumnKeys,
    ]
  );

  const pushHistory = useCallback((batch: PatchBatch) => {
    const history = historyRef.current;
    history.past.push(batch);
    history.future = [];
    if (history.past.length > 50) history.past.shift();
  }, []);

  const applyPrimarySelection = useCallback(
    (productId: number, lineId: number) => {
      const before = { ...primaryLineByProductId };
      const after = { ...before, [productId]: lineId };
      setPrimaryLineByProductId(after);
      pushHistory({
        before: [],
        after: [],
        primaryBefore: before,
        primaryAfter: after,
      });
      setIsDirty(true);
    },
    [primaryLineByProductId, pushHistory]
  );

  const applySnapshots = useCallback((snapshots: RowSnapshot[]) => {
    setGridState((prev) => {
      const nextDrafts: DraftsByProductId = { ...prev.draftsByProductId };
      let nextLines = prev.lines.slice();
      snapshots.forEach((snap) => {
        if (snap.kind === "line") {
          const idx = nextLines.findIndex((row) => row.rowId === snap.rowId);
          if (snap.row && idx >= 0) {
            nextLines[idx] = snap.row;
          } else if (!snap.row && idx >= 0) {
            nextLines.splice(idx, 1);
          }
        } else if (snap.kind === "draft") {
          const list = nextDrafts[snap.productId] || [];
          const idx = list.findIndex((row) => row.rowId === snap.rowId);
          if (snap.row && idx >= 0) {
            list[idx] = snap.row;
            nextDrafts[snap.productId] = list.slice();
          } else if (!snap.row && idx >= 0) {
            const copy = list.slice();
            copy.splice(idx, 1);
            nextDrafts[snap.productId] = copy;
          } else if (snap.row && idx < 0) {
            nextDrafts[snap.productId] = list.concat([snap.row]);
          }
        }
      });
      return { lines: nextLines, draftsByProductId: nextDrafts };
    });
  }, []);

  const normalizeDraftsForProduct = useCallback(
    (drafts: DraftRow[], productId: number) => {
      const meta = productMetaById.get(productId) ?? { sku: "", name: "" };
      const next = drafts.slice();
      let trailingBlankCount = 0;
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (!isBlankDraft(next[i])) break;
        trailingBlankCount += 1;
        if (trailingBlankCount > 1) {
          next.splice(i, 1);
        }
      }
      if (!next.length || !isBlankDraft(next[next.length - 1])) {
        const draft = blankDraft(productId, meta.sku, meta.name);
        draft.rowId = buildRowId(draft);
        next.push(draft);
      }
      return next;
    },
    [productMetaById]
  );

  const normalizeDraftsForProducts = useCallback(
    (productIds: Set<number>) => {
      if (!productIds.size) return;
      setGridState((prev) => {
        const nextDrafts: DraftsByProductId = { ...prev.draftsByProductId };
        productIds.forEach((productId) => {
          const drafts = nextDrafts[productId] || [];
          nextDrafts[productId] = normalizeDraftsForProduct(drafts, productId);
        });
        return { lines: prev.lines, draftsByProductId: nextDrafts };
      });
    },
    [normalizeDraftsForProduct]
  );

  const applyUserPatches = useCallback(
    (
      patches: Array<{ rowId: string; patch: Partial<LineRow & DraftRow> }>,
      options?: { extraDrafts?: DraftRow[] }
    ) => {
      let batch: PatchBatch | null = null;
      setGridState((prev) => {
        const beforeSnapshots: RowSnapshot[] = [];
        const afterSnapshots: RowSnapshot[] = [];
        const nextLines = prev.lines.slice();
        const nextDrafts: DraftsByProductId = { ...prev.draftsByProductId };
        const touchedProducts = new Set<number>();

        if (options?.extraDrafts?.length) {
          const byProduct = new Map<number, DraftRow[]>();
          options.extraDrafts.forEach((draft) => {
            const list = byProduct.get(draft.productId) ?? [];
            list.push(draft);
            byProduct.set(draft.productId, list);
          });
          byProduct.forEach((drafts, productId) => {
            const existing = nextDrafts[productId] || [];
            const merged = existing.concat(drafts);
            drafts.forEach((draft) => {
              beforeSnapshots.push({
                rowId: draft.rowId,
                kind: "draft",
                productId,
                row: null,
              });
              afterSnapshots.push({
                rowId: draft.rowId,
                kind: "draft",
                productId,
                row: draft,
              });
            });
            nextDrafts[productId] = merged;
            touchedProducts.add(productId);
          });
        }

        patches.forEach(({ rowId, patch }) => {
          if (rowId.startsWith("line:")) {
            const idx = nextLines.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const prevRow = nextLines[idx];
            const nextRow = { ...prevRow, ...patch };
            if (
              "childSku" in patch &&
              String(prevRow.childSku || "").trim() !==
                String(nextRow.childSku || "").trim()
            ) {
              nextRow.childName = "";
              nextRow.type = "";
              nextRow.supplier = "";
            }
            beforeSnapshots.push({
              rowId,
              kind: "line",
              productId: prevRow.productId,
              row: prevRow,
            });
            afterSnapshots.push({
              rowId,
              kind: "line",
              productId: prevRow.productId,
              row: nextRow,
            });
            nextLines[idx] = nextRow;
            touchedProducts.add(prevRow.productId);
          } else if (rowId.startsWith("draft:")) {
            let target: DraftRow | null = null;
            let targetIdx = -1;
            let productId: number | null = null;
            Object.entries(nextDrafts).forEach(([pid, drafts]) => {
              const idx = drafts.findIndex((row) => row.rowId === rowId);
              if (idx >= 0) {
                target = drafts[idx];
                targetIdx = idx;
                productId = Number(pid);
              }
            });
            if (!target || productId == null) return;
            const nextRow = { ...target, ...patch };
            if (
              "childSku" in patch &&
              String(target.childSku || "").trim() !==
                String(nextRow.childSku || "").trim()
            ) {
              nextRow.childName = "";
              nextRow.type = "";
              nextRow.supplier = "";
            }
            beforeSnapshots.push({
              rowId,
              kind: "draft",
              productId,
              row: target,
            });
            afterSnapshots.push({
              rowId,
              kind: "draft",
              productId,
              row: nextRow,
            });
            const copy = nextDrafts[productId].slice();
            copy[targetIdx] = nextRow;
            nextDrafts[productId] = copy;
            touchedProducts.add(productId);
          }
        });

        touchedProducts.forEach((productId) => {
          const drafts = nextDrafts[productId] || [];
          const normalized = normalizeDraftsForProduct(drafts, productId);
          if (normalized.length !== drafts.length) {
            const nextIds = new Set(normalized.map((row) => row.rowId));
            drafts.forEach((row) => {
              if (!nextIds.has(row.rowId)) {
                beforeSnapshots.push({
                  rowId: row.rowId,
                  kind: "draft",
                  productId,
                  row,
                });
                afterSnapshots.push({
                  rowId: row.rowId,
                  kind: "draft",
                  productId,
                  row: null,
                });
              }
            });
            const prevIds = new Set(drafts.map((row) => row.rowId));
            normalized.forEach((row) => {
              if (!prevIds.has(row.rowId)) {
                beforeSnapshots.push({
                  rowId: row.rowId,
                  kind: "draft",
                  productId,
                  row: null,
                });
                afterSnapshots.push({
                  rowId: row.rowId,
                  kind: "draft",
                  productId,
                  row,
                });
              }
            });
            nextDrafts[productId] = normalized;
          }
        });

        if (beforeSnapshots.length || afterSnapshots.length) {
          batch = { before: beforeSnapshots, after: afterSnapshots };
        }
        return { lines: nextLines, draftsByProductId: nextDrafts };
      });
      if (batch) {
        pushHistory(batch);
        setIsDirty(true);
      }
    },
    [normalizeDraftsForProduct, pushHistory]
  );

  const applyDerivedPatches = useCallback(
    (patches: Array<{ rowId: string; patch: Partial<LineRow & DraftRow> }>) => {
      setGridState((prev) => {
        const nextLines = prev.lines.slice();
        const nextDrafts: DraftsByProductId = { ...prev.draftsByProductId };
        patches.forEach(({ rowId, patch }) => {
          if (!rowId) return;
          if (rowId.startsWith("line:")) {
            const idx = nextLines.findIndex((row) => row.rowId === rowId);
            if (idx < 0) return;
            const row = nextLines[idx];
            const nextRow = { ...row };
            DERIVED_KEYS.forEach((key) => {
              if (key in patch) {
                if (
                  key === "supplier" &&
                  String((row as any).supplier || "").trim() &&
                  String((patch as any)[key] || "").trim()
                ) {
                  return;
                }
                (nextRow as any)[key] = (patch as any)[key];
              }
            });
            nextLines[idx] = nextRow;
          } else if (rowId.startsWith("draft:")) {
            Object.entries(nextDrafts).forEach(([pid, drafts]) => {
              const idx = drafts.findIndex((row) => row.rowId === rowId);
              if (idx < 0) return;
              const row = drafts[idx];
              const nextRow = { ...row };
              DERIVED_KEYS.forEach((key) => {
                if (key in patch) {
                  if (
                    key === "supplier" &&
                    String((row as any).supplier || "").trim() &&
                    String((patch as any)[key] || "").trim()
                  ) {
                    return;
                  }
                  (nextRow as any)[key] = (patch as any)[key];
                }
              });
              const copy = drafts.slice();
              copy[idx] = nextRow;
              nextDrafts[Number(pid)] = copy;
            });
          }
        });
        return { lines: nextLines, draftsByProductId: nextDrafts };
      });
    },
    []
  );

  const lookupTimerRef = useRef<number | null>(null);
  const pendingLookupRef = useRef<Map<string, string>>(new Map());

  const enqueueSkuLookup = useCallback(
    (rows: Array<{ rowId: string; sku: string }>) => {
      rows.forEach(({ rowId, sku }) => {
        const trimmed = String(sku || "").trim();
        if (!trimmed) return;
        pendingLookupRef.current.set(rowId, trimmed);
      });
      if (lookupTimerRef.current) {
        window.clearTimeout(lookupTimerRef.current);
      }
      lookupTimerRef.current = window.setTimeout(async () => {
        const lookupStartedAt =
          IS_DEV && typeof performance !== "undefined" ? performance.now() : 0;
        const entries = Array.from(pendingLookupRef.current.entries());
        pendingLookupRef.current.clear();
        if (!entries.length) return;
        const skus = Array.from(new Set(entries.map(([, sku]) => sku)));
        try {
          const lookup = await lookupProductsBySkus(skus);
          const patches: Array<{ rowId: string; patch: Partial<LineRow> }> = [];
          entries.forEach(([rowId, sku]) => {
            const info = lookup.get(String(sku).trim().toLowerCase());
            if (!info) return;
            patches.push({
              rowId,
              patch: {
                childName: info?.name || "",
                type: info?.type || "",
                supplier: (info as any)?.supplierName || "",
                activityUsed: (info as any)?.activityUsed || "",
              },
            });
          });
          if (patches.length) applyDerivedPatches(patches);
          if (IS_DEV && lookupStartedAt) {
            const elapsed = Math.round(performance.now() - lookupStartedAt);
            console.info(
              `[boms-sheet-glide] sku lookup ${elapsed}ms`,
              `rows=${entries.length}`,
              `skus=${skus.length}`
            );
          }
        } catch {
          // ignore lookup errors
        }
      }, 120);
    },
    [applyDerivedPatches]
  );

  const enqueueLookupForSnapshots = useCallback(
    (snapshots: RowSnapshot[]) => {
      const rows: Array<{ rowId: string; sku: string }> = [];
      snapshots.forEach((snap) => {
        const row = snap.row as any;
        if (!row) return;
        const sku = String(row.childSku || "").trim();
        if (!sku) return;
        const hasDerived =
          String(row.childName || "").trim() ||
          String(row.type || "").trim() ||
          String(row.supplier || "").trim();
        if (hasDerived) return;
        rows.push({ rowId: snap.rowId, sku });
      });
      if (rows.length) enqueueSkuLookup(rows);
    },
    [enqueueSkuLookup]
  );

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.past.pop();
    if (!batch) return;
    history.future.push(batch);
    applySnapshots(batch.before);
    if (batch.primaryBefore) {
      setPrimaryLineByProductId(batch.primaryBefore);
    }
    const touched = new Set<number>();
    batch.before.forEach((snap) => touched.add(snap.productId));
    normalizeDraftsForProducts(touched);
  }, [applySnapshots, normalizeDraftsForProducts]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    const batch = history.future.pop();
    if (!batch) return;
    history.past.push(batch);
    applySnapshots(batch.after);
    if (batch.primaryAfter) {
      setPrimaryLineByProductId(batch.primaryAfter);
    }
    const touched = new Set<number>();
    batch.after.forEach((snap) => touched.add(snap.productId));
    normalizeDraftsForProducts(touched);
    enqueueLookupForSnapshots(batch.after);
  }, [applySnapshots, enqueueLookupForSnapshots, normalizeDraftsForProducts]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const isUndo =
        (event.metaKey && key === "z" && !event.shiftKey) ||
        (event.ctrlKey && key === "z" && !event.shiftKey);
      const isRedo =
        (event.metaKey && key === "z" && event.shiftKey) ||
        (event.ctrlKey && (key === "y" || (key === "z" && event.shiftKey)));
      if (!isUndo && !isRedo) return;
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) {
        handleRedo();
      } else {
        handleUndo();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleRedo, handleUndo]);

  const themeTokens = useMemo(() => {
    const dark = mantineTheme.colors.dark || [];
    const gray = mantineTheme.colors.gray || [];
    const primaryScale =
      mantineTheme.colors[mantineTheme.primaryColor] || mantineTheme.colors.blue;
    const accent = primaryScale?.[6] || "#4dabf7";
    if (colorScheme === "dark") {
      return {
        pageBg: dark[9] || "#0b0d10",
        gridVoidBg: dark[9] || "#000000",
      gridBaseBg: dark[5] || "#2b2d30",
      gridEditableBg: dark[7] || "#1f2124",
        gridHeaderBg: dark[8] || "#14171a",
        groupHeaderBg: dark[8] || "#111418",
        rowHeaderBg: dark[8] || "#12161a",
        borderSubtle: "rgba(255,255,255,0.06)",
        borderStrong: "rgba(255,255,255,0.12)",
        textPrimary: gray[0] || "rgba(255,255,255,0.92)",
        textMuted: gray[3] || "rgba(255,255,255,0.70)",
        textDim: gray[5] || "rgba(255,255,255,0.55)",
        selectionBg: "rgba(70,140,255,0.22)",
        selectionBorder: "rgba(120,175,255,0.60)",
        focusRing: "rgba(120,175,255,0.85)",
        hoverBg: "rgba(255,255,255,0.04)",
        accent,
      };
    }
    return {
      pageBg: mantineTheme.white || "#ffffff",
      gridVoidBg: gray[0] || "#f8f9fa",
      gridBaseBg: gray[1] || "#f1f3f5",
      gridEditableBg: mantineTheme.white || "#ffffff",
      gridHeaderBg: gray[2] || "#e9ecef",
      groupHeaderBg: gray[2] || "#e9ecef",
      rowHeaderBg: gray[2] || "#e9ecef",
      borderSubtle: gray[3] || "#dee2e6",
      borderStrong: gray[4] || "#ced4da",
      textPrimary: mantineTheme.black || "#000000",
      textMuted: gray[7] || "#495057",
      textDim: gray[6] || "#868e96",
      selectionBg: "rgba(70,140,255,0.12)",
      selectionBorder: accent,
      focusRing: "rgba(70,140,255,0.7)",
      hoverBg: "rgba(0,0,0,0.04)",
      accent,
    };
  }, [colorScheme, mantineTheme]);

  const cellThemes = useMemo(() => {
    return {
      header: {
        bgCell: themeTokens.groupHeaderBg,
        bgCellMedium: themeTokens.groupHeaderBg,
        bgCellEven: themeTokens.groupHeaderBg,
        borderColor: themeTokens.groupHeaderBg,
        textDark: themeTokens.textPrimary,
        textMedium: themeTokens.textMuted,
      },
      readonly: {
        bgCell: themeTokens.gridBaseBg,
        bgCellMedium: themeTokens.gridBaseBg,
        bgCellEven: themeTokens.gridBaseBg,
        borderColor: themeTokens.borderSubtle,
        textDark: themeTokens.textMuted,
        textMedium: themeTokens.textMuted,
      },
      editable: {
        bgCell: themeTokens.gridEditableBg,
        bgCellMedium: themeTokens.gridEditableBg,
        bgCellEven: themeTokens.gridEditableBg,
        borderColor: themeTokens.borderSubtle,
        textDark: themeTokens.textPrimary,
        textMedium: themeTokens.textPrimary,
      },
      void: {
        bgCell: themeTokens.gridVoidBg,
        bgCellMedium: themeTokens.gridVoidBg,
        bgCellEven: themeTokens.gridVoidBg,
        borderColor: themeTokens.gridVoidBg,
        textDark: themeTokens.textDim,
        textMedium: themeTokens.textDim,
      },
    };
  }, [themeTokens]);

  const isEditableCell = useCallback(
    (row: VisibleRow, key: string) =>
      row.kind !== "header" && key !== "product" && EDITABLE_KEYS.has(key),
    []
  );
  const canUseDropdown = !!dropdownRenderer;
  const productColIndex = useMemo(
    () => gridColumns.findIndex((col) => col.key === "product"),
    [gridColumns]
  );
  const lastColIndex = useMemo(
    () => Math.max(0, gridColumns.length - 1),
    [gridColumns.length]
  );

  const resolveDropdownLabel = useCallback(
    (value: string, options: Array<{ label: string; value: string }>) => {
      const match = options.find((opt) => opt.value === value);
      return match?.label ?? value ?? "";
    },
    []
  );

  const getCellContent = useCallback(
    ([col, row]: readonly [number, number]): GridCell => {
      const column = gridColumns[col];
      const rowData = visibleRows[row];
      if (!rowData || !column) {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
          themeOverride: cellThemes.void,
        } as GridCell;
      }
      const key = column.key;
      if (key === "primary") {
        if (rowData.kind === "header") {
          return {
            kind: GridCellKind.Text,
            data: "",
            displayData: "",
            allowOverlay: false,
            readonly: true,
            themeOverride: cellThemes.header,
          } as GridCell;
        }
        if (rowData.kind !== "line") {
          return {
            kind: GridCellKind.Text,
            data: "",
            displayData: "",
            allowOverlay: false,
            readonly: true,
            themeOverride: cellThemes.readonly,
          } as GridCell;
        }
        if (!isFabricType(rowData.type)) {
          return {
            kind: GridCellKind.Text,
            data: "",
            displayData: "",
            allowOverlay: false,
            readonly: true,
            themeOverride: cellThemes.readonly,
          } as GridCell;
        }
        const isSelected =
          primaryLineByProductId[rowData.productId] === Number(rowData.id);
        const display = isSelected ? "●" : "○";
        return {
          kind: GridCellKind.Text,
          data: display,
          displayData: display,
          allowOverlay: false,
          readonly: true,
          themeOverride: cellThemes.editable,
          contentAlign: "center",
        } as GridCell;
      }
      if (rowData.kind === "header") {
        if (key === "product") {
          const label = `${rowData.productSku || ""} — ${rowData.productName || ""}`;
          return {
            kind: GridCellKind.Text,
            data: label,
            displayData: label,
            allowOverlay: false,
            readonly: true,
            themeOverride: cellThemes.header,
            contentAlign: "left",
            span:
              productColIndex >= 0
                ? ([productColIndex, lastColIndex] as [number, number])
                : undefined,
          } as GridCell;
        }
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
          themeOverride: cellThemes.header,
        } as GridCell;
      }
      if (key === "product") {
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
          readonly: true,
          themeOverride: cellThemes.readonly,
        } as GridCell;
      }
      if (key === "supplier") {
        const value = String((rowData as any)[key] || "");
        return {
          kind: GridCellKind.Text,
          data: value,
          displayData: value,
          allowOverlay: false,
          readonly: true,
          themeOverride: cellThemes.readonly,
        } as GridCell;
      }
      if (key === "activityUsed") {
        const isEditable = isEditableCell(rowData, key);
        const value = String((rowData as any)[key] || "");
        const label = resolveDropdownLabel(value, usageOptions);
        if (canUseDropdown) {
          return {
            kind: GridCellKind.Custom,
            allowOverlay: isEditable,
            readonly: !isEditable,
            copyData: label,
            data: {
              kind: "dropdown-cell",
              allowedValues: usageOptions,
              value,
            },
            themeOverride: isEditable ? cellThemes.editable : cellThemes.readonly,
          } as GridCell;
        }
        return {
          kind: GridCellKind.Text,
          data: label,
          displayData: label,
          allowOverlay: false,
          readonly: true,
          themeOverride: isEditable ? cellThemes.editable : cellThemes.readonly,
        } as GridCell;
      }
      const value = (rowData as any)[key];
      const isEditable = isEditableCell(rowData, key);
      return {
        kind: GridCellKind.Text,
        data: resolveText(value),
        displayData: resolveText(value),
        allowOverlay: isEditable,
        readonly: !isEditable,
        contentAlign: isEditable ? "left" : "left",
        themeOverride: isEditable ? cellThemes.editable : cellThemes.readonly,
      } as GridCell;
    },
    [
      canUseDropdown,
      cellThemes,
      isEditableCell,
      gridColumns,
      lastColIndex,
      primaryLineByProductId,
      productColIndex,
      resolveDropdownLabel,
      visibleRows,
    ]
  );


  const onCellEdited = useCallback(
    ([col, row]: readonly [number, number], newValue: any) => {
      const column = gridColumns[col];
      const rowData = visibleRows[row];
      if (!column || !rowData || rowData.kind === "header") return;
      const key = column.key;
      if (!isEditableCell(rowData, key)) return;
      const value =
        newValue?.kind === GridCellKind.Custom &&
        newValue?.data?.kind === "dropdown-cell"
          ? String(newValue.data.value ?? "")
          : String(newValue?.data ?? newValue?.value ?? "");
      applyUserPatches([{ rowId: rowData.rowId, patch: { [key]: value } }]);
      if (key === "childSku") {
        enqueueSkuLookup([{ rowId: rowData.rowId, sku: value }]);
      }
    },
    [applyUserPatches, enqueueSkuLookup, gridColumns, isEditableCell, visibleRows]
  );

  const getCellsForSelection = useCallback(
    (selection: any) => {
      if (!selection || selection === true) return [];
      const { x, y, width, height } = selection;
      const cells: GridCell[][] = [];
      for (let rowIdx = y; rowIdx < y + height; rowIdx += 1) {
        const rowCells: GridCell[] = [];
        for (let colIdx = x; colIdx < x + width; colIdx += 1) {
          rowCells.push(getCellContent([colIdx, rowIdx] as const));
        }
        cells.push(rowCells);
      }
      return cells;
    },
    [getCellContent]
  );

  const onCellClicked = useCallback(
    ([col, row]: readonly [number, number]) => {
      const column = gridColumns[col];
      const rowData = visibleRows[row];
      if (!column || !rowData) return;
      if (column.key !== "primary") return;
      if (rowData.kind !== "line") return;
      if (!isFabricType(rowData.type)) return;
      if (rowData.id == null) return;
      applyPrimarySelection(rowData.productId, Number(rowData.id));
    },
    [applyPrimarySelection, gridColumns, visibleRows]
  );

  const onPaste = useCallback(
    (target: any, values: readonly (readonly string[])[]) => {
      const cell = target?.cell ?? target;
      if (!cell || !Array.isArray(cell)) return false;
      const [col, row] = cell as [number, number];
      const startColumn = gridColumns[col];
      const startRow = visibleRows[row];
      if (!startColumn || !startRow || startRow.kind === "header") return false;
      if (!values.length) return false;
      const productId = startRow.productId;
      const groupRows = visibleRows.filter(
        (r) => r.kind !== "header" && r.productId === productId
      ) as Array<LineRow | DraftRow>;
      const startIndex = groupRows.findIndex((r) => r.rowId === startRow.rowId);
      if (startIndex < 0) return false;

      const updates: Array<{ rowId: string; patch: Partial<LineRow & DraftRow> }> = [];
      const extraDrafts: DraftRow[] = [];
      const lookupRows: Array<{ rowId: string; sku: string }> = [];
      const pasteKeys = new Set(["childSku", "activityUsed", "quantity"]);
      const resolveUsageValue = (raw: string) => {
        const normalized = raw.trim();
        if (!normalized) return "";
        const match =
          usageOptions.find((opt) => opt.value === normalized) ||
          usageOptions.find(
            (opt) => opt.label.toLowerCase() === normalized.toLowerCase()
          );
        return match?.value ?? normalized;
      };
      for (let rowOffset = 0; rowOffset < values.length; rowOffset += 1) {
        const targetRow = groupRows[startIndex + rowOffset];
        let rowRef: LineRow | DraftRow | null = null;
        if (targetRow) {
          rowRef = targetRow;
        } else {
          const meta = productMetaById.get(productId);
          if (!meta) continue;
          const draft = blankDraft(productId, meta.sku, meta.name);
          draft.rowId = buildRowId(draft);
          extraDrafts.push(draft);
          groupRows.push(draft);
          rowRef = draft;
        }
        if (!rowRef) continue;
        const patch: Partial<LineRow & DraftRow> = {};
        for (let colOffset = 0; colOffset < values[rowOffset].length; colOffset += 1) {
          const targetColIdx = col + colOffset;
          const targetColumn = gridColumns[targetColIdx];
          if (!targetColumn) continue;
          const key = targetColumn.key;
          if (!pasteKeys.has(key)) continue;
          if (!isEditableCell(rowRef, key)) continue;
          const raw = String(values[rowOffset][colOffset] ?? "");
          if (key === "quantity") {
            const num = Number(raw);
            (patch as any)[key] = raw.trim() === "" || Number.isNaN(num) ? "" : num;
          } else if (key === "activityUsed") {
            (patch as any)[key] = resolveUsageValue(raw);
          } else if (key === "childSku") {
            const trimmed = raw.trim();
            (patch as any)[key] = trimmed;
          }
        }
        if (Object.keys(patch).length) {
          updates.push({ rowId: rowRef.rowId, patch });
          if ("childSku" in patch && String((patch as any).childSku || "").trim()) {
            lookupRows.push({
              rowId: rowRef.rowId,
              sku: String((patch as any).childSku || ""),
            });
          }
        }
      }
      if (updates.length) {
        applyUserPatches(updates, { extraDrafts });
        if (lookupRows.length) enqueueSkuLookup(lookupRows);
      }
      return updates.length > 0;
    },
    [
      applyUserPatches,
      gridColumns,
      enqueueSkuLookup,
      isEditableCell,
      productMetaById,
      usageOptions,
      visibleRows,
    ]
  );

  const handleItemHovered = useCallback((args: any) => {
    if (!IS_DEV) return;
    setHoverProbe(args || null);
  }, []);

  const handleColumnMoved = useCallback(
    (startIndex: number, endIndex: number) => {
      if (startIndex === endIndex) return;
      const gridKeys = gridColumns.map((col) => col.key);
      const fromKey = gridKeys[startIndex];
      const toKey = gridKeys[endIndex];
      if (!fromKey || !toKey) return;
      if (fromKey === "product" || fromKey === "primary") return;
      if (endIndex <= 1) return;
      const visibleDataKeys = visibleColumnKeys.filter(
        (key) => key !== "product"
      );
      const fromDataIdx = startIndex - 2;
      const toDataIdx = endIndex - 2;
      if (
        fromDataIdx < 0 ||
        toDataIdx < 0 ||
        fromDataIdx >= visibleDataKeys.length ||
        toDataIdx >= visibleDataKeys.length
      )
        return;
      const nextDataKeys = moveKeyByIndex(
        visibleDataKeys,
        fromDataIdx,
        toDataIdx
      );
      const nextVisibleOrder = ["product", ...nextDataKeys];
      const nextHidden = allColumnKeys.filter(
        (key) => !nextVisibleOrder.includes(key) && key !== "product"
      );
      const nextOrder = mergeVisibleOrder(
        columnOrder,
        nextVisibleOrder,
        allColumnKeys
      );
      setColumnOrder(nextOrder);
      setHiddenColumnKeys(nextHidden);
    },
    [allColumnKeys, columnOrder, gridColumns, visibleColumnKeys]
  );

  const handleFillPattern = useCallback(
    (event: any) => {
      const patternSource = event?.patternSource;
      const fillDestination = event?.fillDestination;
      if (!patternSource || !fillDestination) return;
      if (
        patternSource.width <= 0 ||
        patternSource.height <= 0 ||
        fillDestination.width <= 0 ||
        fillDestination.height <= 0
      )
        return;
      if (typeof event?.preventDefault === "function") event.preventDefault();
      const rowsSnapshot = visibleRows;
      const firstSourceRow = rowsSnapshot[patternSource.y];
      if (!firstSourceRow || firstSourceRow.kind === "header") return;
      const productId = firstSourceRow.productId;
      for (
        let rowIdx = patternSource.y;
        rowIdx < patternSource.y + patternSource.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (
          !rowData ||
          rowData.kind === "header" ||
          rowData.productId !== productId
        )
          return;
      }
      for (
        let rowIdx = fillDestination.y;
        rowIdx < fillDestination.y + fillDestination.height;
        rowIdx += 1
      ) {
        const rowData = rowsSnapshot[rowIdx];
        if (
          !rowData ||
          rowData.kind === "header" ||
          rowData.productId !== productId
        )
          return;
      }
      const patchesByRow = new Map<
        string,
        Partial<LineRow & DraftRow>
      >();
      for (
        let rowOffset = 0;
        rowOffset < fillDestination.height;
        rowOffset += 1
      ) {
        const targetRowIdx = fillDestination.y + rowOffset;
        const targetRow = rowsSnapshot[targetRowIdx] as LineRow | DraftRow;
        if (!targetRow) continue;
        for (
          let colOffset = 0;
          colOffset < fillDestination.width;
          colOffset += 1
        ) {
          const targetColIdx = fillDestination.x + colOffset;
          const targetColumn = gridColumns[targetColIdx];
          if (!targetColumn) continue;
          const targetKey = targetColumn.key;
          if (!FILL_KEYS.has(targetKey)) continue;
          if (!isEditableCell(targetRow, targetKey)) continue;
          const sourceRowIdx =
            patternSource.y + (rowOffset % patternSource.height);
          const sourceColIdx =
            patternSource.x + (colOffset % patternSource.width);
          const sourceRow = rowsSnapshot[sourceRowIdx] as LineRow | DraftRow;
          const sourceColumn = gridColumns[sourceColIdx];
          if (!sourceRow || !sourceColumn) continue;
          const sourceKey = sourceColumn.key;
          if (!FILL_KEYS.has(sourceKey)) continue;
          if (!isEditableCell(sourceRow, sourceKey)) continue;
          const value = (sourceRow as any)[sourceKey];
          const patch = patchesByRow.get(targetRow.rowId) || {};
          (patch as any)[targetKey] = value;
          patchesByRow.set(targetRow.rowId, patch);
        }
      }
      const updates = Array.from(patchesByRow, ([rowId, patch]) => ({
        rowId,
        patch,
      }));
      if (updates.length) applyUserPatches(updates);
    },
    [applyUserPatches, gridColumns, isEditableCell, visibleRows]
  );

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const rowsForSave: BomRowBase[] = [];
      gridState.lines.forEach((row) => rowsForSave.push(row));
      Object.values(gridState.draftsByProductId).forEach((drafts) => {
        drafts.forEach((draft) => rowsForSave.push(draft));
      });
      const primaryLineIdsByProduct: Record<number, number> = {};
      linesByProductId.forEach((lines, productId) => {
        const preferredId = primaryLineByProductId[productId];
        if (preferredId != null) {
          const match = lines.find(
            (line) =>
              Number(line.id) === Number(preferredId) &&
              isFabricType(line.type)
          );
          if (match?.id != null) {
            primaryLineIdsByProduct[productId] = Number(match.id);
            return;
          }
        }
        const firstFabric = lines.find((line) => isFabricType(line.type));
        if (firstFabric?.id != null) {
          primaryLineIdsByProduct[productId] = Number(firstFabric.id);
        }
      });
      const payload = {
        _intent: "products.boms.batchSave",
        rows: rowsForSave,
        primaryLineByProductId: primaryLineIdsByProduct,
      };
      const resp = await fetch("/products/boms/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error("Save failed");
      }
      setIsDirty(false);
      return true;
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Unable to save changes"
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [gridState, linesByProductId, primaryLineByProductId]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => {
        setGridState({ lines: initialLines, draftsByProductId: initialDrafts });
        historyRef.current = { past: [], future: [] };
        setIsDirty(false);
        setSaveError(null);
      },
      formState: { isDirty },
    }),
    [initialDrafts, initialLines, isDirty]
  );
  useInitGlobalFormContext(formHandlers as any, () => save(), formHandlers.reset);
  const handleDone = useCallback(async () => {
    if (!isDirty) {
      navigate(returnTo);
      return;
    }
    const ok = await save();
    if (ok) navigate(returnTo);
  }, [isDirty, navigate, returnTo, save]);
  const handleDiscard = useCallback(() => {
    formHandlers.reset();
  }, [formHandlers]);

  const glideTheme = useMemo(() => {
    const fontFamily = mantineTheme.fontFamily || "system-ui";
    return {
      bgCanvas: themeTokens.gridVoidBg,
      bgCell: themeTokens.gridVoidBg,
      bgCellMedium: themeTokens.gridVoidBg,
      bgCellEven: themeTokens.gridVoidBg,
      bgHeader: themeTokens.gridHeaderBg,
      bgHeaderHasFocus: themeTokens.gridHeaderBg,
      bgHeaderHovered: themeTokens.gridHeaderBg,
      bgHeaderSelected: themeTokens.gridHeaderBg,
      headerFontStyle: `600 14px ${fontFamily}`,
      baseFontStyle: `500 14px ${fontFamily}`,
      markerFontStyle: `500 14px ${fontFamily}`,
      textDark: themeTokens.textPrimary,
      textMedium: themeTokens.textMuted,
      textHeader: themeTokens.textMuted,
      textLight: themeTokens.textDim,
      accentColor: themeTokens.selectionBorder,
      accentFg: themeTokens.textPrimary,
      accentLight: themeTokens.selectionBg,
      bgSearchResult: themeTokens.selectionBg,
      borderColor: themeTokens.gridVoidBg,
      horizontalBorderColor: themeTokens.gridVoidBg,
      headerBottomBorderColor: themeTokens.borderStrong,
      drilldownIndicatorColor: themeTokens.textDim,
    };
  }, [mantineTheme.fontFamily, themeTokens]);
  const rowHeight = 34;

  const debugPayload = useMemo<DebugExplainPayload | null>(() => {
    const visibleRowsSample =
      IS_DEV
        ? visibleRows.slice(0, 6).map((row) => ({
            rowId: row.rowId,
            kind: row.kind,
            productId: row.productId,
            childSku: (row as any).childSku ?? null,
          }))
        : [];
    return {
      context: {
        module: "products",
        entity: { type: "bomsSheet", id: searchParams.get("ids") || "batch" },
        generatedAt: new Date().toISOString(),
        version: "boms-sheet-glide",
      },
      inputs: {
        params: { ids: searchParams.get("ids") },
        flags: [],
      },
      derived: {
        rowsCount: initialRows.length,
        visibleRowsCount: visibleRows.length,
        columnKeys: gridColumns.map((col) => col.key),
        columnOrder: IS_DEV ? columnOrder : undefined,
        hiddenColumns: IS_DEV ? hiddenColumnKeys : undefined,
        visibleRowsSample,
        colorScheme,
        gridSize: { width: gridWidth, height: gridHeight },
        columnsPixelWidth,
        widthsByKey,
        themeTokens: IS_DEV ? themeTokens : undefined,
        themeOverrideAppliedKeys: IS_DEV ? Object.keys(glideTheme) : undefined,
        rowHeight,
        primaryLineByProductId: IS_DEV ? primaryLineByProductId : undefined,
        isClient,
        hoverProbe: IS_DEV && hoverProbe
          ? {
              kind: hoverProbe.kind,
              location: hoverProbe.location,
              region: hoverProbe.region,
            }
          : undefined,
      },
      reasoning: [],
    };
  }, [
    gridHeight,
    gridWidth,
    initialRows.length,
    isClient,
    searchParams,
    columnOrder,
    hiddenColumnKeys,
    gridColumns,
    themeTokens,
    glideTheme,
    primaryLineByProductId,
    visibleRows,
    visibleRows.length,
    widthsByKey,
    columnsPixelWidth,
    hoverProbe,
  ]);

  return (
    <SheetShell
      title="Batch Edit BOMs"
      backTo={returnTo}
      onDone={handleDone}
      saveState={saveError ? "error" : saving ? "saving" : "idle"}
      rightExtra={
        <Group gap={8} wrap="nowrap">
          <Button
            size="xs"
            variant="default"
            onClick={handleDiscard}
            disabled={!isDirty || saving}
          >
            Discard
          </Button>
          <Button
            size="xs"
            onClick={() => save()}
            disabled={!isDirty || saving}
          >
            Save
          </Button>
        </Group>
      }
      debugPayload={debugPayload}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpecWithProduct.id,
        scope: "index",
        viewSpec: viewSpecWithProduct,
        rowsForRelevance: visibleRows,
        selection: columnSelection,
      }}
    >
      {(gridHeight) => (
        <SheetFrame gridHeight={gridHeight}>
          {(bodyHeight) => (
            <div
              ref={gridRef}
              className="AxisBomsGlideSheet"
              style={
                {
                  height: bodyHeight,
                  width: "100%",
                  backgroundColor: themeTokens.gridVoidBg,
                  "--grid-void-bg": themeTokens.gridVoidBg,
                  "--grid-base-bg": themeTokens.gridBaseBg,
                  "--grid-editable-bg": themeTokens.gridEditableBg,
                  "--grid-header-bg": themeTokens.gridHeaderBg,
                  "--group-header-bg": themeTokens.groupHeaderBg,
                  "--row-header-bg": themeTokens.rowHeaderBg,
                  "--border-subtle": themeTokens.borderSubtle,
                  "--border-strong": themeTokens.borderStrong,
                  "--text-primary": themeTokens.textPrimary,
                  "--text-muted": themeTokens.textMuted,
                  "--text-dim": themeTokens.textDim,
                  "--selection-bg": themeTokens.selectionBg,
                  "--selection-border": themeTokens.selectionBorder,
                  "--focus-ring": themeTokens.focusRing,
                  "--hover-bg": themeTokens.hoverBg,
                } as CSSProperties
              }
            >
              {isClient && gridWidth > 0 && gridHeight > 0 && visibleRows.length > 0 ? (
                <DataEditor
                  key={`glide:${visibleRows.length}:${columns.length}`}
                  columns={columns}
                  getCellContent={getCellContent}
                  onCellEdited={onCellEdited}
                  onCellClicked={onCellClicked}
                  getCellsForSelection={getCellsForSelection}
                  onPaste={onPaste as any}
                  fillHandle={true}
                  allowedFillDirections="orthogonal"
                  onFillPattern={handleFillPattern as any}
                  customRenderers={dropdownRenderer ? [dropdownRenderer] : undefined}
                  rows={visibleRows.length}
                  rowHeight={rowHeight}
                  freezeColumns={1}
                  rowMarkers={{
                    kind: "number",
                    theme: {
                      bgCell: themeTokens.rowHeaderBg,
                      bgCellMedium: themeTokens.rowHeaderBg,
                      bgCellEven: themeTokens.rowHeaderBg,
                      textDark: themeTokens.textDim,
                      textMedium: themeTokens.textDim,
                      textLight: themeTokens.textDim,
                      borderColor: themeTokens.borderStrong,
                      markerFontStyle: "500 14px system-ui",
                    },
                  }}
                  width={gridWidth}
                  height={gridHeight}
                  theme={glideTheme}
                  onItemHovered={handleItemHovered as any}
                  onColumnMoved={handleColumnMoved}
                  onColumnResize={(col, width) => {
                    setWidthsByKey((prev) => ({
                      ...prev,
                      [String(col.id)]: Math.max(60, Math.floor(width)),
                    }));
                  }}
                />
              ) : null}
            </div>
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
