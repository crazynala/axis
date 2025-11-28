import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import type { Prisma } from "@prisma/client";
import { useLoaderData, useNavigate } from "@remix-run/react";
import * as RDG from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInitGlobalFormContext } from "@aa/timber";
import { prismaBase } from "../../../utils/prisma.server";
import { FullzoomAppShell } from "~/components/sheets/FullzoomAppShell";
import { DEFAULT_MIN_ROWS } from "~/components/sheets/rowPadding";
import { padRowsWithDisableControls } from "~/components/sheets/disableControls";
import {
  SheetExitButton,
  SheetSaveButton,
  useSheetDirtyPrompt,
} from "~/components/sheets/SheetControls";
import { withGroupTrailingBlank } from "~/components/sheets/groupRows";
import { SkuLookupCell } from "~/components/sheets/SkuLookupCell";
import {
  UsageSelectCell,
  normalizeUsageValue,
  type UsageValue,
} from "~/components/sheets/UsageSelectCell";
import {
  ProductPickerModal,
  type ProductPickerItem,
} from "~/modules/product/components/ProductPickerModal";
import {
  lookupProductsBySkus,
  type ProductLookupInfo,
} from "~/modules/product/utils/productLookup.client";

export type CostingEditRow = {
  id: number | null; // costing id
  assemblyId: number | null;
  assemblyName: string;
  productId: number | null;
  productSku: string;
  productName: string;
  activityUsed: string;
  quantityPerUnit: number | string;
  unitCost: number | string;
  required: number | string;
  groupStart?: boolean;
  isGroupPad?: boolean;
  disableControls?: boolean;
  localKey: string;
};

let localKeyCounter = 0;
const nextLocalKey = () => {
  localKeyCounter += 1;
  return `costing-${Date.now().toString(36)}-${localKeyCounter}`;
};

const blankCostingRow = (): CostingEditRow => ({
  id: null,
  assemblyId: null,
  assemblyName: "",
  productId: null,
  productSku: "",
  productName: "",
  activityUsed: "",
  quantityPerUnit: "",
  unitCost: "",
  required: "",
  groupStart: false,
  isGroupPad: false,
  disableControls: false,
  localKey: nextLocalKey(),
});

const toNumberOrNull = (value: unknown): number | null => {
  if (value === "" || value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
type LoaderData = {
  rows: CostingEditRow[];
  exitUrl: string;
  actionPath: string;
};

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const rawAssemblyParam = String(params.assemblyId || "");
  const assemblyIds = rawAssemblyParam
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!Number.isFinite(jobId) || jobId <= 0 || assemblyIds.length === 0) {
    return redirect("/jobs");
  }

  const assemblies = await prismaBase.assembly.findMany({
    where: { jobId, id: { in: assemblyIds } },
    select: { id: true, qtyOrderedBreakdown: true, name: true },
  });

  if (!assemblies.length) {
    return redirect(`/jobs/${jobId}`);
  }

  const validIdSet = new Set(assemblies.map((a) => a.id));
  const normalizedIds = assemblyIds.filter((id) => validIdSet.has(id));
  if (!normalizedIds.length) {
    return redirect(`/jobs/${jobId}`);
  }

  const normalizedParam = normalizedIds.join(",");
  if (normalizedParam !== rawAssemblyParam) {
    throw redirect(`/jobs/${jobId}/assembly/${normalizedParam}/costings-sheet`);
  }

  const orderedByAsm = new Map<number, number>();
  const nameByAsm = new Map<number, string>();
  for (const asm of assemblies) {
    const arr = (asm as any).qtyOrderedBreakdown as number[] | null;
    const ordered = Array.isArray(arr)
      ? arr.reduce((total, value) => total + (Number(value) || 0), 0)
      : 0;
    orderedByAsm.set(asm.id, ordered);
    nameByAsm.set(asm.id, asm.name || "");
  }

  const costings = await prismaBase.costing.findMany({
    where: { assemblyId: { in: normalizedIds } },
    orderBy: [{ assemblyId: "asc" }, { productId: "asc" }, { id: "asc" }],
    select: {
      id: true,
      assemblyId: true,
      productId: true,
      quantityPerUnit: true,
      unitCost: true,
      activityUsed: true,
      product: { select: { sku: true, name: true } },
    },
  });

  const rows: CostingEditRow[] = costings.map((c) => {
    const qpu = Number(c.quantityPerUnit || 0) || 0;
    const ordered = orderedByAsm.get(c.assemblyId || 0) || 0;
    const required = ordered * qpu;
    return {
      id: c.id,
      assemblyId: c.assemblyId ?? null,
      assemblyName: nameByAsm.get(c.assemblyId ?? 0) || "",
      productId: c.productId ?? null,
      productSku: c.product?.sku || "",
      productName: c.product?.name || "",
      activityUsed: String(c.activityUsed || ""),
      quantityPerUnit: qpu,
      unitCost: Number(c.unitCost || 0) || 0,
      required,
      localKey: nextLocalKey(),
      disableControls: false,
    } as CostingEditRow;
  });

  return json<LoaderData>({
    rows,
    exitUrl: `/jobs/${jobId}/assembly/${normalizedParam}`,
    actionPath: `/jobs/${jobId}/assembly/${normalizedParam}/costings-sheet`,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const bodyText = await request.text();
  let payload: any = null;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {}
  if (!payload || payload._intent !== "costings.batchSave") {
    return json({ error: "Invalid intent" }, { status: 400 });
  }
  const rows: CostingEditRow[] = Array.isArray(payload.rows)
    ? payload.rows
    : [];

  type SanitizedRow = {
    id: number | null;
    assemblyId: number | null;
    productId: number | null;
    productSku: string;
    quantityPerUnit: number | null;
    activityUsed: "cut" | "make" | null;
  };

  const sanitizeQuantity = (value: unknown): number | null => {
    if (value === "" || value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  const sanitizeActivity = (value: unknown): "cut" | "make" | null => {
    const str = typeof value === "string" ? value.trim().toLowerCase() : "";
    return str === "cut" || str === "make" ? (str as "cut" | "make") : null;
  };

  const sanitizedRows: SanitizedRow[] = rows
    .map((row) => {
      const sku =
        typeof row?.productSku === "string" ? row.productSku.trim() : "";
      return {
        id: toNumberOrNull(row?.id),
        assemblyId: toNumberOrNull(row?.assemblyId),
        productId: toNumberOrNull(row?.productId),
        productSku: sku,
        quantityPerUnit: sanitizeQuantity(row?.quantityPerUnit),
        activityUsed: sanitizeActivity(row?.activityUsed),
      };
    })
    .filter(
      (row) =>
        (row.assemblyId != null || row.id != null) &&
        (row.id != null ||
          row.productSku ||
          row.quantityPerUnit !== null ||
          row.activityUsed)
    );

  const requestedSkus = Array.from(
    new Set(sanitizedRows.map((r) => r.productSku).filter(Boolean))
  );
  const productBySku = new Map<string, number>();
  if (requestedSkus.length) {
    const products = await prismaBase.product.findMany({
      where: {
        OR: requestedSkus.map((sku) => ({
          sku: { equals: sku, mode: "insensitive" as const },
        })),
      },
      select: { id: true, sku: true },
    });
    for (const product of products) {
      if (!product.sku) continue;
      productBySku.set(product.sku.toLowerCase(), product.id);
    }
  }

  const updateOps: Prisma.PrismaPromise<unknown>[] = [];
  const createOps: Prisma.PrismaPromise<unknown>[] = [];
  const unknownSkus = new Set<string>();

  for (const row of sanitizedRows) {
    const skuKey = row.productSku ? row.productSku.toLowerCase() : "";
    const resolvedProductId = skuKey
      ? productBySku.get(skuKey) ?? row.productId
      : row.productId;

    if (row.id) {
      const data: any = {};
      if (row.quantityPerUnit !== null)
        data.quantityPerUnit = row.quantityPerUnit;
      if (row.activityUsed) data.activityUsed = row.activityUsed;
      if (row.productSku && !resolvedProductId) {
        unknownSkus.add(row.productSku);
      } else if (resolvedProductId && resolvedProductId !== row.productId) {
        data.productId = resolvedProductId;
      }
      if (Object.keys(data).length) {
        updateOps.push(
          prismaBase.costing.update({ where: { id: row.id }, data })
        );
      }
    } else if (row.productSku) {
      if (!row.assemblyId) continue;
      if (!resolvedProductId) {
        unknownSkus.add(row.productSku);
        continue;
      }
      createOps.push(
        prismaBase.costing.create({
          data: {
            assemblyId: row.assemblyId,
            productId: resolvedProductId,
            quantityPerUnit: row.quantityPerUnit ?? 0,
            activityUsed: row.activityUsed,
          },
        })
      );
    }
  }

  if (updateOps.length || createOps.length) {
    await prismaBase.$transaction([...updateOps, ...createOps]);
  }

  return json({
    ok: true,
    created: createOps.length,
    updated: updateOps.length,
    unknownSkus: Array.from(unknownSkus),
  });
}

export default function CostingsSheetRoute() {
  const {
    rows: initialRows,
    exitUrl,
    actionPath,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  const controller = RDG.useDataSheetController<CostingEditRow>(
    (initialRows || []).slice().sort((a, b) => {
      const aa = (a.assemblyId ?? 0) - (b.assemblyId ?? 0);
      if (aa !== 0) return aa;
      const pa = (a.productId ?? 0) - (b.productId ?? 0);
      if (pa !== 0) return pa;
      return (a.id ?? 0) - (b.id ?? 0);
    }),
    { sanitize: (list) => list.slice(), historyLimit: 200 }
  );
  const rows = controller.value;
  const setRows = controller.setValue;

  useSheetDirtyPrompt();
  const prevRowsRef = useRef<CostingEditRow[]>([]);

  const isRowMeaningful = useCallback(
    (row: CostingEditRow | null | undefined) => {
      if (!row) return false;
      if (row.id != null) return true;
      const sku = (row.productSku || "").trim();
      const name = (row.productName || "").trim();
      const activity = (row.activityUsed || "").trim();
      const hasQty = !(
        row.quantityPerUnit === "" ||
        row.quantityPerUnit === null ||
        row.quantityPerUnit === undefined
      );
      return Boolean(sku || name || activity || hasQty);
    },
    []
  );

  const normalizeEditableRows = useCallback(
    (list: CostingEditRow[]) => {
      const cleaned: CostingEditRow[] = [];
      (list || []).forEach((row) => {
        if (!row) return;
        const normalized: CostingEditRow = {
          ...row,
          id: toNumberOrNull(row.id),
          assemblyId: toNumberOrNull(row.assemblyId),
          groupStart: undefined,
          isGroupPad: false,
          productId: toNumberOrNull(row.productId),
          productName:
            typeof row.productName === "string" ? row.productName : "",
          productSku:
            typeof row.productSku === "string" ? row.productSku.trim() : "",
          localKey: row.localKey || nextLocalKey(),
          activityUsed: normalizeUsageValue(row.activityUsed),
        };
        if (!normalized.productSku) normalized.productSku = "";
        if (!isRowMeaningful(normalized)) {
          return;
        }
        cleaned.push(normalized);
      });
      return cleaned;
    },
    [isRowMeaningful]
  );

  useEffect(() => {
    if (!rows.length || prevRowsRef.current.length) return;
    prevRowsRef.current = normalizeEditableRows(rows);
  }, [rows, normalizeEditableRows]);

  const markBlocks = useCallback((list: CostingEditRow[]) => {
    const keyFor = (row: CostingEditRow, index: number) => {
      if (row.assemblyId != null) return `assembly-${row.assemblyId}`;
      if (row.id != null) return `row-${row.id}`;
      return `idx-${index}`;
    };
    const out: CostingEditRow[] = [];
    let i = 0;
    while (i < list.length) {
      const key = keyFor(list[i], i);
      let j = i;
      let first = true;
      while (j < list.length && keyFor(list[j], j) === key) {
        out.push({ ...list[j], groupStart: first });
        first = false;
        j++;
      }
      i = j;
    }
    return out;
  }, []);

  const normalizeSkuKey = useCallback(
    (sku: string) => sku.trim().toLowerCase(),
    []
  );
  const pendingSkusRef = useRef<Map<string, string>>(new Map());
  const lookupTimerRef = useRef<number | null>(null);

  const applyLookupResults = useCallback(
    (map: Map<string, ProductLookupInfo>) => {
      if (!map.size) return;
      const curr = controller.getValue();
      let dirty = false;
      const next = curr.map((row) => {
        const sku = String(row.productSku || "").trim();
        if (!sku) return row;
        const info =
          map.get(normalizeSkuKey(sku)) ||
          map.get(sku) ||
          map.get(sku.toUpperCase());
        if (!info) return row;
        const nextRow = {
          ...row,
          productName: info.name || "",
          productId:
            typeof info.id === "number"
              ? info.id
              : info.id == null
              ? row.productId ?? null
              : Number(info.id) || row.productId || null,
        } as CostingEditRow;
        if (
          nextRow.productName === row.productName &&
          nextRow.productId === row.productId
        ) {
          return row;
        }
        dirty = true;
        return nextRow;
      });
      if (!dirty) return;
      controller.setValue(next);
      const normalized = normalizeEditableRows(next as CostingEditRow[]);
      prevRowsRef.current = normalized;
    },
    [controller, normalizeEditableRows, normalizeSkuKey]
  );

  const enqueueLookup = useCallback(
    (skus: string[]) => {
      (skus || []).forEach((raw) => {
        const trimmed = String(raw || "").trim();
        if (!trimmed) return;
        const key = normalizeSkuKey(trimmed);
        pendingSkusRef.current.set(key, trimmed);
      });
      if (!pendingSkusRef.current.size) return;
      if (lookupTimerRef.current) window.clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = window.setTimeout(async () => {
        const nextBatch = Array.from(pendingSkusRef.current.values());
        pendingSkusRef.current.clear();
        if (!nextBatch.length) return;
        try {
          const map = await lookupProductsBySkus(nextBatch);
          applyLookupResults(map);
        } catch {
          // ignore network errors
        } finally {
          lookupTimerRef.current = null;
        }
      }, 160);
    },
    [applyLookupResults, normalizeSkuKey]
  );

  const processNormalizedRows = useCallback(
    (normalized: CostingEditRow[]) => {
      const prevMap = new Map(
        prevRowsRef.current.map((row) => [row.localKey, row])
      );
      const toLookup: string[] = [];
      const cleaned = normalized.map((row) => {
        const sku = String(row.productSku || "").trim();
        const prev = prevMap.get(row.localKey);
        const prevSku = prev ? String(prev.productSku || "").trim() : "";
        const normalizedRow: CostingEditRow = {
          ...row,
          productSku: sku,
        };
        if (!sku) {
          normalizedRow.productId = null;
          normalizedRow.productName = "";
          return normalizedRow;
        }
        if (normalizeSkuKey(sku) !== normalizeSkuKey(prevSku)) {
          normalizedRow.productId = null;
          normalizedRow.productName = "";
          toLookup.push(sku);
        }
        return normalizedRow;
      });
      if (toLookup.length) enqueueLookup(toLookup);
      prevRowsRef.current = cleaned;
      setRows(markBlocks(cleaned));
    },
    [enqueueLookup, markBlocks, normalizeSkuKey, setRows]
  );

  const pickerTargetKeyRef = useRef<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerResults, setPickerResults] = useState<ProductPickerItem[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerAssemblyOnly, setPickerAssemblyOnly] = useState(false);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerResults([]);
    pickerTargetKeyRef.current = null;
  }, []);

  const openPickerForRow = useCallback((row: CostingEditRow | null) => {
    if (!row) return;
    if (!row.localKey) row.localKey = nextLocalKey();
    const targetKey = row.localKey;
    pickerTargetKeyRef.current = targetKey;
    setPickerSearch(row.productSku || "");
    setPickerOpen(true);
  }, []);

  const handlePickerSelect = useCallback(
    (product: ProductPickerItem) => {
      if (!pickerTargetKeyRef.current) return;
      const curr = controller.getValue();
      const next = curr.map((row) => {
        if (row.localKey !== pickerTargetKeyRef.current) return row;
        return {
          ...row,
          productId: product.id ?? null,
          productSku: product.sku || "",
          productName: product.name || "",
        } as CostingEditRow;
      });
      controller.setValue(next);
      const normalized = normalizeEditableRows(next as CostingEditRow[]);
      prevRowsRef.current = normalized;
      closePicker();
    },
    [closePicker, controller, normalizeEditableRows]
  );

  useEffect(() => {
    if (!pickerOpen) {
      setPickerLoading(false);
      setPickerResults([]);
      return;
    }
    const q = pickerSearch.trim();
    if (!q) {
      setPickerLoading(false);
      setPickerResults([]);
      return;
    }
    let active = true;
    setPickerLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL(`/api/products/lookup`, window.location.origin);
        url.searchParams.set("q", q);
        const resp = await fetch(url.toString());
        const data = await resp.json().catch(() => ({ products: [] }));
        if (!active) return;
        let arr: ProductPickerItem[] = Array.isArray(data?.products)
          ? (data.products as ProductPickerItem[])
          : [];
        if (pickerAssemblyOnly) {
          arr = arr.filter((p) => (p?._count?.productLines ?? 0) === 0);
        }
        setPickerResults(arr);
      } catch {
        if (active) setPickerResults([]);
      } finally {
        if (active) setPickerLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pickerOpen, pickerSearch, pickerAssemblyOnly]);

  useEffect(() => {
    setRows(markBlocks(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const col = useCallback(
    (
      key: keyof CostingEditRow,
      title: string,
      grow = 1,
      disabled = false
    ): Column<CostingEditRow> =>
      ({
        ...((RDG.keyColumn as any)(key as any, RDG.textColumn) as any),
        id: key as string,
        title,
        grow,
        disabled,
      } as any),
    []
  );

  const columns = useMemo<Column<CostingEditRow>[]>(() => {
    const assemblyCol: Column<CostingEditRow> = {
      ...((RDG.keyColumn as any)("assemblyName" as any, RDG.textColumn) as any),
      id: "assemblyName",
      title: "Assembly",
      grow: 1.2,
      component: ({ rowData }: any) =>
        rowData.groupStart ? rowData.assemblyName || rowData.assemblyId : "",
      disabled: true,
    } as any;
    const skuCol: Column<CostingEditRow> = {
      ...((RDG.keyColumn as any)("productSku" as any, RDG.textColumn) as any),
      id: "productSku",
      title: "SKU",
      grow: 1.1,
      disabled: false,
      component: ({ rowData, setRowData, focus, stopEditing }: any) => {
        const rowDisabled = Boolean(rowData?.disableControls);
        return (
          <SkuLookupCell
            value={rowData.productSku || ""}
            focus={focus}
            readOnly={rowDisabled}
            showLookup={!rowData.productId && !rowDisabled}
            onLookup={() => openPickerForRow(rowData)}
            onChange={(value) => {
              setRowData({
                ...rowData,
                productSku: value,
                productId: null,
                productName: "",
              });
              enqueueLookup([value]);
            }}
            onPaste={(text) => {
              const first = text.split("\t")[0]?.split("\n")[0]?.trim() || "";
              if (!first) return;
              setRowData({
                ...rowData,
                productSku: first,
                productId: null,
                productName: "",
              });
              enqueueLookup([first]);
            }}
            onBlur={() => stopEditing?.({ nextRow: false })}
          />
        );
      },
    } as any;
    const nameCol = col("productName", "Name", 1.6, true);
    const usageCol: Column<CostingEditRow> = {
      ...((RDG.keyColumn as any)("activityUsed" as any, RDG.textColumn) as any),
      id: "activityUsed",
      title: "Usage",
      grow: 0.9,
      disabled: false,
      component: ({ rowData, setRowData, focus, stopEditing }: any) => {
        const rowDisabled = Boolean(rowData?.disableControls);
        return (
          <UsageSelectCell
            value={(rowData.activityUsed || "") as UsageValue}
            focus={focus}
            readOnly={rowDisabled}
            onBlur={() => stopEditing?.({ nextRow: false })}
            onChange={(value) =>
              setRowData({
                ...rowData,
                activityUsed: value,
              })
            }
          />
        );
      },
    } as any;
    const qpuCol = col("quantityPerUnit", "Qty/Unit", 0.9, false);
    const unitCostCol = col("unitCost", "Unit Cost", 1, true);
    return [assemblyCol, skuCol, nameCol, usageCol, qpuCol, unitCostCol];
  }, [col, enqueueLookup, openPickerForRow]);

  const onChange = useCallback(
    (next: CostingEditRow[]) => {
      const normalized = normalizeEditableRows(next || []);
      processNormalizedRows(normalized);
    },
    [normalizeEditableRows, processNormalizedRows]
  );

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const payload = { _intent: "costings.batchSave", rows };
      const resp = await fetch(actionPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        // eslint-disable-next-line no-alert
        alert("Save failed");
        return;
      }
      const data = await resp.json().catch(() => null);
      if (Array.isArray(data?.unknownSkus) && data.unknownSkus.length) {
        // eslint-disable-next-line no-alert
        alert(
          `Unknown SKU${
            data.unknownSkus.length === 1 ? "" : "s"
          }: ${data.unknownSkus.join(", ")}`
        );
        return;
      }
      navigate(exitUrl);
    } finally {
      setSaving(false);
    }
  }, [rows, actionPath, navigate, exitUrl]);

  const resetRows = useCallback(() => {
    controller.reset(initialRows || []);
    prevRowsRef.current = normalizeEditableRows(initialRows || []);
  }, [controller, initialRows, normalizeEditableRows]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => resetRows(),
      formState: { isDirty: controller.state.isDirty },
    }),
    [controller.state.isDirty, resetRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => resetRows()
  );

  return (
    <>
      <FullzoomAppShell
        title="Batch Edit Costings"
        left={<SheetExitButton to={exitUrl} />}
        right={<SheetSaveButton saving={saving} />}
      >
        {(gridHeight) => {
          const groupedRows = withGroupTrailingBlank(
            rows,
            (row) => row.assemblyId ?? row.id,
            ({ template }) => {
              if (!template?.assemblyId) return null;
              return {
                ...blankCostingRow(),
                assemblyId: template.assemblyId,
                assemblyName: template.assemblyName,
                isGroupPad: true,
              };
            }
          );
          const baseLength = groupedRows.length;
          const displayRows = padRowsWithDisableControls(
            groupedRows,
            DEFAULT_MIN_ROWS,
            () => ({ ...blankCostingRow() }),
            { extraInteractiveRows: 0 }
          );
          return (
            <RDG.DataSheetGrid
              value={displayRows as any}
              onChange={onChange as any}
              columns={columns as any}
              height={gridHeight}
              getBlockKey={({
                rowData,
              }: {
                rowData: CostingEditRow;
                rowIndex: number;
              }) => rowData.assemblyId ?? rowData.id}
              blockTopClassName="dsg-block-top"
            />
          );
        }}
      </FullzoomAppShell>
      <ProductPickerModal
        opened={pickerOpen}
        onClose={closePicker}
        title="Select Product"
        searchValue={pickerSearch}
        onSearchChange={setPickerSearch}
        results={pickerResults}
        loading={pickerLoading}
        assemblyItemOnly={pickerAssemblyOnly}
        onAssemblyItemOnlyChange={setPickerAssemblyOnly}
        onSelect={handlePickerSelect}
      />
    </>
  );
}
