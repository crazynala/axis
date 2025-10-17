import { json } from "@remix-run/node";
import { AppShell, Group, Text, Stack, Button, Card } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import * as RDG from "react-datasheet-grid";
import { useDataSheetController } from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";
import { IconLogout2 } from "@tabler/icons-react";

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
      activityUsed: line.activityUsed || "",
      type: (line.child?.type as string) || "",
      supplier: (line.child?.supplier?.name as string) || "",
      quantity: (line.quantity as any) ?? "",
      groupStart: idx === 0,
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
  console.log("** ProductsBomsFullzoom mount");
  const { rows: initialRows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
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
      activityUsed: r.activityUsed || "",
    }));
  }, []);

  const controller = useDataSheetController<MultiBOMRow>(initialRows || [], {
    sanitize,
    historyLimit: 200,
  });
  const rows = controller.value;
  const setRows = controller.setValue;

  // Helpers for trailing blanks and padding must be defined before use
  const ensureProductTrailingBlank = useCallback((list: MultiBOMRow[]) => {
    console.log("** ensureTrailingBlank in", { len: list.length });
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
        });
      }
      if (filtered.length) filtered[0] = { ...filtered[0], groupStart: true };
      for (let j = 1; j < filtered.length; j++)
        filtered[j] = { ...filtered[j], groupStart: false };
      out.push(...filtered);
    }
    console.log("** ensureTrailingBlank out", { len: out.length });
    return out;
  }, []);

  // Minimum row padding to keep grid visually full
  const MIN_ROWS = 40;
  const padRows = useCallback((list: MultiBOMRow[]) => {
    const out = list.slice();
    if (out.length === 0) return out;
    if (out.length >= MIN_ROWS) return out;
    const last = out[out.length - 1];
    const toAdd = MIN_ROWS - out.length;
    console.log("** padRows", { before: list.length, toAdd });
    for (let i = 0; i < toAdd; i++) {
      out.push({
        productId: last.productId,
        productSku: last.productSku,
        productName: last.productName,
        id: null,
        childSku: "",
        childName: "",
        activityUsed: "",
        type: "",
        supplier: "",
        quantity: "",
        groupStart: false,
      });
    }
    return out;
  }, []);

  const normalizeRows = useCallback(
    (list: MultiBOMRow[]) => padRows(ensureProductTrailingBlank(list)),
    [ensureProductTrailingBlank, padRows]
  );

  useEffect(() => {
    console.log(
      "** useEffect initialRows",
      Array.isArray(initialRows) ? initialRows.length : -1
    );
    const base = (initialRows || rows || []) as MultiBOMRow[];
    const next = normalizeRows(base);
    console.log("** normalize and reset on loader change", {
      before: base.length,
      after: next.length,
    });
    controller.reset(next);
  }, [controller, initialRows, normalizeRows, rows]);

  // Helpers for batched SKU lookup and trailing blank per product
  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<any>(null);
  const prevRowsRef = useRef<MultiBOMRow[]>(initialRows || []);
  // We fully own paste; no DSG prePaste or overflow trackers needed
  const enqueueLookup = useCallback(
    (skus: string[]) => {
      console.log("** enqueueLookup", { add: (skus || []).length });
      skus.filter(Boolean).forEach((s) => pendingSkusRef.current.add(s));
      if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
      lookupTimerRef.current = setTimeout(async () => {
        const toFetch = Array.from(pendingSkusRef.current);
        pendingSkusRef.current.clear();
        if (!toFetch.length) return;
        try {
          console.log("** lookup start", { skus: toFetch.length });
          const map = await lookupProductsBySkus(toFetch);
          console.log("** lookup done", { hits: map.size });
          const curr = controller.getValue();
          const next = curr.map((r: MultiBOMRow) => {
            const info = r.childSku ? map.get(r.childSku) : null;
            if (!info) return r;
            return {
              ...r,
              childName: info?.name || "",
              type: (info?.type as string) || "",
              supplier: (info?.supplierName as string) || "",
            } as MultiBOMRow;
          });
          const norm = normalizeRows(next);
          console.log("** lookup patch", {
            before: next.length,
            after: norm.length,
          });
          controller.setValue(norm);
        } catch {}
      }, 120);
    },
    [controller, normalizeRows]
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
    } as any;
    const nameCol = col("childName" as any, "Name", 2, true) as any;
    const typeCol = col("type" as any, "Type", 1, true) as any;
    const supplierCol = col("supplier" as any, "Supplier", 1.2, true) as any;

    return [
      productCol,
      idCol,
      skuCol,
      qtyCol,
      usageCol,
      nameCol,
      typeCol,
      supplierCol,
    ];
  }, [col, enqueueLookup]);

  const onChange = useCallback(
    (next: MultiBOMRow[]) => {
      console.log("** onChange", {
        nextLen: Array.isArray(next) ? next.length : -1,
      });
      // Diff childSku to trigger lookups for newly set/changed SKUs
      const prev = prevRowsRef.current || [];
      const toLookup: string[] = [];
      const max = next.length;
      for (let i = 0; i < max; i++) {
        const currSku = (next[i]?.childSku || "").trim();
        const prevSku = (prev[i]?.childSku || "").trim();
        if (currSku && currSku !== prevSku) toLookup.push(currSku);
      }
      if (toLookup.length) {
        console.log("** onChange lookup skus", { count: toLookup.length });
        enqueueLookup(toLookup);
      }
      // Clear dependent fields when SKU is blank or has just changed (until lookup fills it)
      const cleared = (next as MultiBOMRow[]).map((r, i) => {
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
      const norm = normalizeRows(cleared || []);
      console.log("** onChange normalized", { after: norm.length });
      prevRowsRef.current = norm;
      controller.setValue(norm);
    },
    [controller, normalizeRows, enqueueLookup]
  );

  const save = useCallback(async () => {
    const payload = { _intent: "products.boms.batchSave", rows };
    const resp = await fetch("/products/boms-fullzoom", {
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
  }, [rows, navigate]);

  const formHandlers = useMemo(
    () => ({
      handleSubmit: (onSubmit: (data: any) => void) => () => onSubmit({}),
      reset: () => controller.reset(normalizeRows(initialRows || [])),
      formState: { isDirty: controller.state.isDirty },
    }),
    [controller.state.isDirty, initialRows, normalizeRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => controller.reset(normalizeRows(initialRows || []))
  );

  // Numeric height required by DataSheetGrid
  const { height: viewportHeight } = useViewportSize();
  const gridHeight = Math.max(240, viewportHeight - 160);

  return (
    <AppShell header={{ height: 100 }} padding={0} withBorder={false}>
      <AppShell.Header>
        <Group justify="space-between" align="center" px={24} py={16}>
          <Button variant="subtle" onClick={() => navigate(-1)}>
            <IconLogout2 />
            Exit
          </Button>
          <Text size="xl">Batch Edit BOMs</Text>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {/* <Stack>
          <Card withBorder> */}
        <div>
          <RDG.DataSheetGrid
            value={rows as any}
            onChange={onChange as any}
            columns={columns as any}
            height={gridHeight}
            // Enable block semantics in the grid and debug logs from the fork
            getBlockKey={({
              rowData,
            }: {
              rowData: MultiBOMRow;
              rowIndex: number;
            }) => rowData.productId}
            blockAutoInsert
            debugBlocks
            blockTopClassName="dsg-block-top"
            createRowInBlock={({
              blockKey,
              rowIndex,
            }: {
              blockKey: string | number | null | undefined;
              rowIndex: number;
            }) => {
              // Find a representative row for this product to copy metadata
              const keyNum =
                typeof blockKey === "number" ? blockKey : Number(blockKey ?? 0);
              const idx = rows.findIndex((r) => r.productId === keyNum);
              const base =
                idx >= 0 ? rows[idx] : (rows[rows.length - 1] as MultiBOMRow);
              console.log("** createRowInBlock", {
                key: blockKey,
                keyNum,
                baseIdx: idx,
                rowIndex,
              });
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
              } as MultiBOMRow;
            }}
            createRow={() => ({
              productId: rows.length ? rows[rows.length - 1].productId : 0,
              productSku: rows.length ? rows[rows.length - 1].productSku : "",
              productName: rows.length ? rows[rows.length - 1].productName : "",
              id: null,
              childSku: "",
              childName: "",
              activityUsed: "",
              type: "",
              supplier: "",
              quantity: "",
            })}
          />
        </div>
        {/* </Card>
        </Stack> */}
      </AppShell.Main>
    </AppShell>
  );
}
