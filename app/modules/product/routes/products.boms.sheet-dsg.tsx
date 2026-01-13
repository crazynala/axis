import { json } from "@remix-run/node";
import { SheetShell } from "~/components/sheets/SheetShell";
import { useInitGlobalFormContext } from "@aa/timber";
import { useLoaderData, useNavigate } from "@remix-run/react";
import * as RDG from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { debugEnabled } from "~/utils/debugFlags";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import {
  guardColumnsWithDisableControls,
  padRowsWithDisableControls,
} from "~/components/sheets/disableControls";
import { useSheetDirtyPrompt } from "~/components/sheets/SheetControls";
import { SheetFrame } from "~/components/sheets/SheetFrame";
import { SheetGrid } from "~/components/sheets/SheetGrid";
import { useUndoableController } from "~/components/sheets/useUndoableController";
import {
  UsageSelectCell,
  normalizeUsageValue,
  type UsageValue,
} from "~/components/sheets/UsageSelectCell";
import { useSheetColumnSelection } from "~/base/sheets/useSheetColumns";
import { productSpec } from "~/modules/product/spec";

type MultiBOMRow = {
  productId: number;
  productSku: string;
  productName: string;
  id: number | null; // productLine id
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
  groupStart?: boolean; // first row for its product
  disableControls?: boolean;
};
export async function loader({ request }: any) {
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids") || "";
  const ids: number[] = idsParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  const { prismaBase } = await import("~/utils/prisma.server");
  const products = await prismaBase.product.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      sku: true,
      name: true,
      productLines: {
        orderBy: { id: "asc" },
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
  const rows: MultiBOMRow[] = [];
  for (const p of products) {
    const items: MultiBOMRow[] = p.productLines.map((line, idx) => ({
      productId: p.id,
      productSku: p.sku || "",
      productName: p.name || "",
      id: line.id,
      childSku: line.child?.sku || "",
      childName: line.child?.name || "",
      activityUsed: normalizeUsageValue(line.activityUsed),
      type: (line.child?.type as string) || "",
      supplier: (line.child?.supplier?.name as string) || "",
      quantity: (line.quantity as any) ?? "",
      groupStart: idx === 0,
      disableControls: false,
    }));
    if (items.length === 0) {
      items.push({
        productId: p.id,
        productSku: p.sku || "",
        productName: p.name || "",
        id: null,
        childSku: "",
        childName: "",
        activityUsed: "",
        type: "",
        supplier: "",
        quantity: "",
        groupStart: true,
        disableControls: false,
      });
    }
    rows.push(...items);
  }
  return json({ rows });
}

export async function action({ request }: any) {
  const bodyText = await request.text();
  let jsonBody: any = null;
  try {
    jsonBody = JSON.parse(bodyText || "{}");
  } catch {}
  const intent = jsonBody?._intent || "";
  if (intent !== "products.boms.batchSave")
    return json({ error: "Invalid intent" }, { status: 400 });
  const rows: MultiBOMRow[] = Array.isArray(jsonBody.rows) ? jsonBody.rows : [];
  // Group by product
  const byProduct = new Map<number, MultiBOMRow[]>();
  for (const r of rows) {
    if (!r || (r as any).productId == null) continue;
    const pid = Number((r as any).productId);
    const arr = byProduct.get(pid) || [];
    arr.push(r);
    byProduct.set(pid, arr);
  }
  const { prismaBase } = await import("~/utils/prisma.server");
  const { applyBomBatch } = await import(
    "~/modules/product/services/productBom.server"
  );
  const results: any[] = [];
  for (const [productId, set] of byProduct) {
    const items = set; // all rows are items now
    const providedIds = new Set(
      items
        .map((r) => (Number.isFinite(r.id as any) ? Number(r.id) : null))
        .filter(Boolean) as number[]
    );
    // Load existing lines with child sku to detect replacements
    const existing = await prismaBase.productLine.findMany({
      where: { parentId: productId },
      select: { id: true, child: { select: { sku: true } } },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    const existingSkuById = new Map<number, string>(
      existing.map((e) => [e.id, e.child?.sku || ""]) as any
    );
    const deletesSet = new Set<number>();
    // Delete any missing ids (removed rows)
    for (const id of existingIds) if (!providedIds.has(id)) deletesSet.add(id);

    const updates: {
      id: number;
      quantity?: number;
      activityUsed?: string | null;
    }[] = [];
    const creates: {
      childSku: string;
      quantity?: number;
      activityUsed?: string | null;
    }[] = [];

    for (const r of items) {
      const idNum = Number.isFinite(r.id as any) ? Number(r.id) : null;
      const skuTrim = String(r.childSku || "").trim();
      if (idNum) {
        const existingSku = (existingSkuById.get(idNum) || "").trim();
        if (!skuTrim) {
          // Cleared SKU -> delete existing line
          deletesSet.add(idNum);
        } else if (existingSku && skuTrim !== existingSku) {
          // SKU changed -> replace by delete + create
          deletesSet.add(idNum);
          creates.push({
            childSku: skuTrim,
            quantity: Number(r.quantity) || 0,
            activityUsed: r.activityUsed || null,
          });
        } else {
          // Same SKU -> update fields
          updates.push({
            id: idNum,
            quantity: Number(r.quantity) || 0,
            activityUsed: r.activityUsed || null,
          });
        }
      } else if (skuTrim) {
        // New row with SKU -> create
        creates.push({
          childSku: skuTrim,
          quantity: Number(r.quantity) || 0,
          activityUsed: r.activityUsed || null,
        });
      }
    }

    const res = await applyBomBatch(
      productId,
      updates,
      creates,
      Array.from(deletesSet)
    );
    results.push({ productId, ...res });
  }
  return json({ ok: true, results });
}

export default function ProductsBomsFullzoom() {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.info("[boms-sheet] mount");
    return () => {
      // eslint-disable-next-line no-console
      console.info("[boms-sheet] unmount");
    };
  }, []);
  const { rows: initialRows } = useLoaderData<typeof loader>();
  const normalizedInitialRows = useMemo(
    () =>
      ((initialRows || []) as MultiBOMRow[]).map((row) => ({
        ...row,
        activityUsed: normalizeUsageValue(row.activityUsed),
        disableControls: false,
      })),
    [initialRows]
  );
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  useSheetDirtyPrompt();
  const exitUrl = "/products";
  const sanitize = useCallback((list: MultiBOMRow[]) => {
    // Strip derived fields and trailing blanks for dirty compare
    const core = (list || []).filter((r) => {
      const blank =
        !r.childSku &&
        !r.childName &&
        !r.activityUsed &&
        (r.quantity === "" || r.quantity == null);
      return !blank;
    });
    return core.map((r) => ({
      productId: r.productId,
      id: r.id ?? null,
      childSku: String(r.childSku || "").trim(),
      quantity: Number(r.quantity) || 0,
      activityUsed: normalizeUsageValue(r.activityUsed),
    }));
  }, []);

  const isBlankRow = useCallback((row?: MultiBOMRow | null) => {
    if (!row) return true;
    return (
      !row.childSku &&
      !row.childName &&
      !row.activityUsed &&
      (row.quantity === "" || row.quantity == null)
    );
  }, []);

  const stripTrailingBlanksByProduct = useCallback(
    (list: MultiBOMRow[]) => {
      const out: MultiBOMRow[] = [];
      let i = 0;
      while (i < list.length) {
        const pid = list[i].productId;
        const chunk: MultiBOMRow[] = [];
        while (i < list.length && list[i].productId === pid) {
          chunk.push(list[i]);
          i++;
        }
        let end = chunk.length;
        while (end > 1 && isBlankRow(chunk[end - 1])) end -= 1;
        const trimmed = chunk.slice(0, end);
        if (trimmed.length) trimmed[0] = { ...trimmed[0], groupStart: true };
        for (let j = 1; j < trimmed.length; j++) {
          trimmed[j] = { ...trimmed[j], groupStart: false };
        }
        out.push(...trimmed);
      }
      return out;
    },
    [isBlankRow]
  );

  const normalizeEditableRows = useCallback(
    (list: MultiBOMRow[]) => {
      const normalized = (list || [])
        .filter((row) => !row.disableControls)
        .map((row) => ({
          ...row,
          activityUsed: normalizeUsageValue(row.activityUsed),
          disableControls: false,
        }));
      return stripTrailingBlanksByProduct(normalized);
    },
    [stripTrailingBlanksByProduct]
  );

  const [editableRows, setEditableRows] = useState<MultiBOMRow[]>(
    () => normalizeEditableRows(normalizedInitialRows || [])
  );
  const baseControllerRef = useRef<{ value: MultiBOMRow[]; setValue: (rows: MultiBOMRow[]) => void }>({
    value: [],
    setValue: setEditableRows,
  });
  baseControllerRef.current.value = editableRows;
  baseControllerRef.current.setValue = setEditableRows;
  const undoableController = useUndoableController(baseControllerRef.current, {
    enabled: true,
    isRowBlank: isBlankRow,
  });
  const sheetController = undoableController;
  const rows = editableRows;
  const viewSpec = productSpec.sheet?.views["boms"];
  if (!viewSpec) {
    throw new Error("Missing product sheet spec: boms");
  }
  const columnSelection = useSheetColumnSelection({
    moduleKey: "products",
    viewId: viewSpec.id,
    scope: "index",
    viewSpec,
  });
  const controllerRef = useRef(undoableController);
  useEffect(() => {
    controllerRef.current = undoableController;
  }, [undoableController]);

  // Helpers for trailing blanks and padding must be defined before use
  const ensureProductTrailingBlank = useCallback((list: MultiBOMRow[]) => {
    // For each contiguous group of same productId, keep one trailing blank and mark first row as groupStart
    const out: MultiBOMRow[] = [];
    let i = 0;
    while (i < list.length) {
      const pid = list[i].productId;
      const sku = list[i].productSku;
      const name = list[i].productName;
      const chunk: MultiBOMRow[] = [];
      while (i < list.length && list[i].productId === pid) {
        chunk.push(list[i]);
        i++;
      }
      // remove extra blanks (keep only the last)
      const filtered: MultiBOMRow[] = [];
      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const blank =
          !row.childSku &&
          !row.childName &&
          !row.activityUsed &&
          (row.quantity === "" || row.quantity == null);
        if (blank) {
          let anyAfter = false;
          for (let k = j + 1; k < chunk.length; k++) {
            const r2 = chunk[k];
            const blank2 =
              !r2.childSku &&
              !r2.childName &&
              !r2.activityUsed &&
              (r2.quantity === "" || r2.quantity == null);
            if (!blank2) {
              anyAfter = true;
              break;
            }
          }
          if (anyAfter) continue;
        }
        filtered.push(row);
      }
      const last = filtered[filtered.length - 1];
      const lastIsBlank =
        last &&
        !last.childSku &&
        !last.childName &&
        !last.activityUsed &&
        (last.quantity === "" || last.quantity == null);
      if (!lastIsBlank) {
        filtered.push({
          productId: pid,
          productSku: sku,
          productName: name,
          id: null,
          childSku: "",
          childName: "",
          activityUsed: "",
          type: "",
          supplier: "",
          quantity: "",
          groupStart: false,
          disableControls: false,
        });
      }
      if (filtered.length) filtered[0] = { ...filtered[0], groupStart: true };
      for (let j = 1; j < filtered.length; j++)
        filtered[j] = { ...filtered[j], groupStart: false };
      out.push(...filtered);
    }
    return out;
  }, []);

  const normalizeDisplayRows = useCallback(
    (list: MultiBOMRow[]) => {
      const normalizedUsage = (list || []).map((row) => ({
        ...row,
        activityUsed: normalizeUsageValue(row.activityUsed),
        disableControls: false,
      }));
      return padRowsWithDisableControls(
        ensureProductTrailingBlank(normalizedUsage),
        DEFAULT_MIN_ROWS,
        (last) => ({
          productId: last?.productId ?? 0,
          productSku: last?.productSku ?? "",
          productName: last?.productName ?? "",
          id: null,
          childSku: "",
          childName: "",
          activityUsed: "",
          type: "",
          supplier: "",
          quantity: "",
          groupStart: false,
          disableControls: false,
        }),
        { extraInteractiveRows: 0 }
      );
    },
    [ensureProductTrailingBlank]
  );

  useEffect(() => {
    const base = normalizeEditableRows(normalizedInitialRows || []);
    try {
      const same = JSON.stringify(rows) === JSON.stringify(base);
      if (!same) {
        controllerRef.current.replaceData?.(base);
      }
    } catch {
      controllerRef.current.replaceData?.(base);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedInitialRows, normalizeEditableRows]);

  // Helpers for batched SKU lookup and trailing blank per product
  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<any>(null);
  const prevRowsRef = useRef<MultiBOMRow[]>(rows || []);
  const lookupEpochRef = useRef(0);
  useEffect(() => {
    prevRowsRef.current = rows || [];
  }, [rows]);
  // We fully own paste; no DSG prePaste or overflow trackers needed
  const normalizeSkuKey = useCallback(
    (value: string) => value.trim().toLowerCase(),
    []
  );
  const enqueueLookup = useCallback(
    (skus: string[]) => {
      console.log("** enqueueLookup", { add: (skus || []).length });
      skus
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .forEach((s) => pendingSkusRef.current.add(s));
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = setTimeout(async () => {
        const epoch = lookupEpochRef.current;
        const toFetch = Array.from(pendingSkusRef.current);
        pendingSkusRef.current.clear();
        if (!toFetch.length) return;
        try {
          console.log("** lookup start", { skus: toFetch.length });
          const map = await lookupProductsBySkus(toFetch);
          console.log("** lookup done", { hits: map.size });
          const curr = prevRowsRef.current || [];
          const next = curr.map((r: MultiBOMRow) => {
            const key = normalizeSkuKey(String(r.childSku || ""));
            const info = key ? map.get(key) || map.get(r.childSku || "") : null;
            if (!info) return r;
            return {
              ...r,
              childName: info?.name || "",
              type: (info?.type as string) || "",
              supplier: (info?.supplierName as string) || "",
            } as MultiBOMRow;
          });
          if (epoch !== lookupEpochRef.current) {
            if (debugEnabled("DEBUG_SHEET_HISTORY")) {
              // eslint-disable-next-line no-console
              console.info("[lookup] skip", { epoch, current: lookupEpochRef.current });
            }
            return;
          }
          const norm = normalizeEditableRows(next);
          if (debugEnabled("DEBUG_SHEET_HISTORY")) {
            // eslint-disable-next-line no-console
            console.info("[lookup] apply", { epoch });
          }
          undoableController.applyDerivedPatch?.(norm);
        } catch {}
      }, 120);
    },
    [normalizeEditableRows, normalizeSkuKey, undoableController]
  );

  // Removed app-level paste interception. Rely on forked grid block paste.

  const col = useCallback(
    (
      key: keyof MultiBOMRow,
      title: string,
      grow = 1,
      disabled = false
    ): Column<MultiBOMRow> => ({
      ...((RDG.keyColumn as any)(key as any, RDG.textColumn) as any),
      id: key as string,
      title,
      grow,
      disabled,
    }),
    []
  );

  const columns = useMemo<Column<MultiBOMRow>[]>(() => {
    const productCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("productName" as any, RDG.textColumn) as any),
      id: "product",
      title: "Product",
      grow: 1.8,
      component: ({ rowData }: any) => (
        <span>
          {rowData.groupStart
            ? `${rowData.productSku || ""} — ${rowData.productName || ""}`
            : ""}
        </span>
      ),
      disabled: true,
    } as any;
    const idCol = col("id" as any, "Line ID", 0.6, true) as any;
    const skuCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("childSku" as any, RDG.textColumn) as any),
      id: "childSku",
      title: "SKU",
      grow: 1.2,
      disabled: false,
    } as any;
    const qtyCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("quantity" as any, RDG.textColumn) as any),
      id: "quantity",
      title: "Qty",
      grow: 0.8,
    } as any;
    const usageCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("activityUsed" as any, RDG.textColumn) as any),
      id: "activityUsed",
      title: "Usage",
      grow: 1,
      component: ({ rowData, setRowData, focus, stopEditing }: any) => (
        <UsageSelectCell
          value={(rowData.activityUsed || "") as UsageValue}
          focus={focus}
          onBlur={() => stopEditing?.({ nextRow: false })}
          onChange={(value) =>
            setRowData({
              ...rowData,
              activityUsed: value,
            })
          }
        />
      ),
    } as any;
    const nameCol = col("childName" as any, "Name", 2, true) as any;
    const typeCol = col("type" as any, "Type", 1, true) as any;
    const supplierCol = col("supplier" as any, "Supplier", 1.2, true) as any;

    const cols: Column<MultiBOMRow>[] = [
      productCol,
      idCol,
      skuCol,
      qtyCol,
      usageCol,
      nameCol,
      typeCol,
      supplierCol,
    ];
    const guarded = guardColumnsWithDisableControls(cols);
    const byKey = new Map(guarded.map((column) => [String(column.id), column]));
    return columnSelection.selectedKeys
      .map((key) => byKey.get(key))
      .filter(Boolean) as Column<MultiBOMRow>[];
  }, [col, columnSelection.selectedKeys, enqueueLookup]);

  const displayRows = useMemo(
    () => normalizeDisplayRows(rows),
    [normalizeDisplayRows, rows]
  );

  const initialSanitized = useMemo(
    () => JSON.stringify(sanitize(normalizeEditableRows(normalizedInitialRows || []))),
    [sanitize, normalizeEditableRows, normalizedInitialRows]
  );
  const isDirty = useMemo(
    () => JSON.stringify(sanitize(rows)) !== initialSanitized,
    [rows, sanitize, initialSanitized]
  );
  const handleUndoRedo = useCallback(() => {
    lookupEpochRef.current += 1;
    pendingSkusRef.current.clear();
    if (lookupTimerRef.current) {
      clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = null;
    }
  }, []);
  useEffect(() => {
    sheetController.state = { isDirty };
    sheetController.onUndoRedo = handleUndoRedo;
  }, [sheetController, isDirty, handleUndoRedo]);

  const onChange = useCallback(
    (next: MultiBOMRow[]) => {
      const normalized = normalizeEditableRows(next || []);
      // Diff childSku to trigger lookups for newly set/changed SKUs
      const prev = prevRowsRef.current || [];
      const toLookup: string[] = [];
      const max = normalized.length;
      for (let i = 0; i < max; i++) {
        const currSku = (normalized[i]?.childSku || "").trim();
        const prevSku = (prev[i]?.childSku || "").trim();
        if (currSku && currSku !== prevSku) toLookup.push(currSku);
      }
      if (toLookup.length) {
        enqueueLookup(toLookup);
      }
      // Clear dependent fields when SKU is blank or has just changed (until lookup fills it)
      const cleared = (normalized as MultiBOMRow[]).map((r, i) => {
        const sku = String(r.childSku || "").trim();
        const prevSku = String(prev[i]?.childSku || "").trim();
        if (!sku || sku !== prevSku) {
          return {
            ...r,
            childName: sku ? r.childName || "" : "",
            type: sku ? r.type || "" : "",
            supplier: sku ? r.supplier || "" : "",
          };
        }
        return r;
      });
      prevRowsRef.current = cleared;
      undoableController.onChange?.(cleared);
    },
    [normalizeEditableRows, enqueueLookup, undoableController]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        _intent: "products.boms.batchSave",
        rows: normalizeEditableRows(rows),
      };
      const resp = await fetch("/products/boms/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        // eslint-disable-next-line no-alert
        alert("Save failed");
        return;
      }
      navigate("/products?refreshed=1");
    } finally {
      setSaving(false);
    }
  }, [rows, navigate, normalizeEditableRows]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => setEditableRows(normalizeEditableRows(initialRows || [])),
      formState: { isDirty },
    }),
    [isDirty, initialRows, normalizeEditableRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => undoableController.replaceData?.(normalizeEditableRows(initialRows || []))
  );

  return (
    <SheetShell
      title="Batch Edit BOMs"
      controller={sheetController}
      backTo={exitUrl}
      saveState={saving ? "saving" : "idle"}
      columnPicker={{
        moduleKey: "products",
        viewId: viewSpec.id,
        scope: "index",
        viewSpec,
        rowsForRelevance: rows,
        selection: columnSelection,
      }}
    >
      {(gridHeight) => (
        <SheetFrame gridHeight={gridHeight}>
          {(bodyHeight) => (
            <SheetGrid
              key={`cols:${columnSelection.selectedKeys.join("|")}`}
              controller={sheetController}
              value={displayRows as any}
              onChange={onChange as any}
              columns={columns as any}
              height={bodyHeight}
              undoable={false}
              // Enable block semantics in the grid (no extra debug UI)
              getBlockKey={({
                rowData,
              }: {
                rowData: MultiBOMRow;
                rowIndex: number;
              }) => rowData.productId}
              blockAutoInsert
              blockTopClassName="dsg-block-top"
              createRowInBlock={({
                blockKey,
                rowIndex,
              }: {
                blockKey: string | number | null | undefined;
                rowIndex: number;
              }) => {
                const keyNum =
                  typeof blockKey === "number"
                    ? blockKey
                    : Number(blockKey ?? 0);
                const idx = displayRows.findIndex((r) => r.productId === keyNum);
                const base =
                  idx >= 0
                    ? displayRows[idx]
                    : (displayRows[displayRows.length - 1] as MultiBOMRow);
                return {
                  productId: base?.productId ?? keyNum ?? 0,
                  productSku: base?.productSku ?? "",
                  productName: base?.productName ?? "",
                  id: null,
                  childSku: "",
                  childName: "",
                  activityUsed: "",
                  type: "",
                  supplier: "",
                  quantity: "",
                  disableControls: false,
                } as MultiBOMRow;
              }}
              createRow={() => ({
                productId: displayRows.length
                  ? displayRows[displayRows.length - 1].productId
                  : 0,
                productSku: displayRows.length
                  ? displayRows[displayRows.length - 1].productSku
                  : "",
                productName: displayRows.length
                  ? displayRows[displayRows.length - 1].productName
                  : "",
                id: null,
                childSku: "",
                childName: "",
                activityUsed: "",
                type: "",
                supplier: "",
                quantity: "",
                disableControls: false,
              })}
            />
          )}
        </SheetFrame>
      )}
    </SheetShell>
  );
}
