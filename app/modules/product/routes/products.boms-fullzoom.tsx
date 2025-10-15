import { json } from "@remix-run/node";
import { AppShell, Group, Text, Stack, Button, Card } from "@mantine/core";
import { useViewportSize } from "@mantine/hooks";
import { SaveCancelHeader, useInitGlobalFormContext } from "@aa/timber";
import { useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import * as RDG from "react-datasheet-grid";
import type { Column } from "react-datasheet-grid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { lookupProductsBySkus } from "~/modules/product/utils/productLookup.client";

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
    const existing = await prismaBase.productLine.findMany({
      where: { parentId: productId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((e) => e.id));
    const deletes: number[] = [];
    for (const id of existingIds) if (!providedIds.has(id)) deletes.push(id);
    const updates = items
      .filter((r) => Number.isFinite(r.id as any))
      .map((r) => ({
        id: Number(r.id),
        quantity: Number(r.quantity) || 0,
        activityUsed: r.activityUsed || null,
      }));
    const creates = items
      .filter((r) => !r.id && r.childSku)
      .map((r) => ({
        childSku: r.childSku.trim(),
        quantity: Number(r.quantity) || 0,
        activityUsed: r.activityUsed || null,
      }));
    const res = await applyBomBatch(productId, updates, creates, deletes);
    results.push({ productId, ...res });
  }
  return json({ ok: true, results });
}

export default function ProductsBomsFullzoom() {
  const { rows: initialRows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const [rows, setRows] = useState<MultiBOMRow[]>(initialRows || []);

  useEffect(() => {
    setRows((prev) => {
      // If initialRows is provided, normalize it
      return normalizeRows(initialRows || prev || []);
    });
  }, [initialRows]);

  // Helpers for batched SKU lookup and trailing blank per product
  const pendingSkusRef = useRef<Set<string>>(new Set());
  const lookupTimerRef = useRef<any>(null);
  const enqueueLookup = useCallback((skus: string[]) => {
    skus.filter(Boolean).forEach((s) => pendingSkusRef.current.add(s));
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(async () => {
      const toFetch = Array.from(pendingSkusRef.current);
      pendingSkusRef.current.clear();
      if (!toFetch.length) return;
      try {
        const map = await lookupProductsBySkus(toFetch);
        setRows((curr) => {
          const next = curr.map((r) => {
            const info = r.childSku ? map.get(r.childSku) : null;
            if (!info) return r;
            return {
              ...r,
              childName: info?.name || "",
              type: (info?.type as string) || "",
              supplier: (info?.supplierName as string) || "",
            };
          });
          return normalizeRows(next);
        });
      } catch {}
    }, 120);
  }, []);

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
        });
      }
      if (filtered.length) filtered[0] = { ...filtered[0], groupStart: true };
      for (let j = 1; j < filtered.length; j++)
        filtered[j] = { ...filtered[j], groupStart: false };
      out.push(...filtered);
    }
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
      component: ({ rowData, setRowData, focus }: any) => {
        return (
          <input
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
            }}
            value={rowData.childSku || ""}
            onChange={(e) => {
              const sku = e.target.value;
              setRowData({ ...rowData, childSku: sku });
              enqueueLookup([sku]);
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (text) enqueueLookup([text.split("\t")[0].split("\n")[0]]);
            }}
            autoFocus={focus}
          />
        );
      },
      disabled: false,
    } as any;
    const qtyCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("quantity" as any, RDG.textColumn) as any),
      id: "quantity",
      title: "Qty",
      grow: 0.8,
      component: ({ rowData, setRowData }: any) => {
        return (
          <input
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
            }}
            value={rowData.quantity ?? ""}
            onChange={(e) =>
              setRowData({ ...rowData, quantity: e.target.value })
            }
          />
        );
      },
    } as any;
    const usageCol: Column<MultiBOMRow> = {
      ...((RDG.keyColumn as any)("activityUsed" as any, RDG.textColumn) as any),
      id: "activityUsed",
      title: "Usage",
      grow: 1,
      component: ({ rowData, setRowData }: any) => {
        return (
          <input
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
            }}
            value={rowData.activityUsed || ""}
            onChange={(e) =>
              setRowData({ ...rowData, activityUsed: e.target.value })
            }
          />
        );
      },
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
      setRows(() => normalizeRows((next as MultiBOMRow[]) || []));
    },
    [normalizeRows]
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
      reset: () => setRows(normalizeRows(initialRows || [])),
      formState: { isDirty: true },
    }),
    [initialRows, normalizeRows]
  );
  useInitGlobalFormContext(
    formHandlers as any,
    () => save(),
    () => setRows(normalizeRows(initialRows || []))
  );

  // Numeric height required by DataSheetGrid
  const { height: viewportHeight } = useViewportSize();
  const gridHeight = Math.max(240, viewportHeight - 160);

  return (
    <AppShell header={{ height: 100 }} padding={0} withBorder={false}>
      <AppShell.Header>
        <Group justify="space-between" align="center" px={24} py={16}>
          <Text size="xl">Batch Edit BOMs</Text>
          <SaveCancelHeader />
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        {/* <Stack>
          <Card withBorder> */}
        <RDG.DataSheetGrid
          value={rows as any}
          onChange={onChange as any}
          columns={columns as any}
          height={gridHeight}
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
        {/* </Card>
        </Stack> */}
      </AppShell.Main>
    </AppShell>
  );
}
