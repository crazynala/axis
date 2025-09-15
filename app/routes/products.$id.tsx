import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation, useSubmit, useActionData } from "@remix-run/react";
import { Badge, Button, Card, Checkbox, Grid, Group, Stack, Table, Text, TextInput, Title } from "@mantine/core";
import { HotkeyAwareModal } from "../hotkeys/HotkeyAwareModal";
import "react-datasheet-grid/dist/style.css";
import { DataSheetGrid, keyColumn, textColumn, type Column } from "react-datasheet-grid";

type BOMRow = {
  id: number | null;
  childId?: number | null;
  childSku: string;
  childName: string;
  activityUsed: string;
  type: string;
  supplier: string;
  quantity: number | string;
};
import { useProductFindify } from "../find/productFindify";
import { useCallback, useMemo, useState, useEffect } from "react";
import { Controller } from "react-hook-form";
import { useInitGlobalFormContext, BreadcrumbSet } from "@aa/timber";
import { productIdentityFields, productAssocFields, productPricingFields, productBomFindFields } from "../formConfigs/productDetail";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { buildWhereFromConfig } from "../utils/buildWhereFromConfig.server";
import { prismaBase, getProductStockSnapshots, runWithDbActivity } from "../utils/prisma.server";
import { requireUserId } from "../utils/auth.server";
import { replaceProductTags } from "../utils/tags.server";
import { TagPicker } from "../components/TagPicker";
import { ProductFindManager } from "../components/ProductFindManager";
import { useRecordContext } from "../record/RecordContext";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.product ? `Product ${data.product.name ?? data.product.id}` : "Product",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  return runWithDbActivity("products.detail", async () => {
    const idStr = params.id;
    const id = Number(idStr);
    if (!idStr || Number.isNaN(id)) {
      throw new Response("Invalid product id", { status: 400 });
    }
    const t0 = Date.now();
    const marks: Array<{ label: string; ms: number }> = [];
    const mark = (label: string) => marks.push({ label, ms: Date.now() - t0 });

    // Parallel queries (non-transaction) to avoid interactive transaction timeout.
    const productPromise = prismaBase.product.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        purchaseTax: { select: { id: true, label: true } },
        category: { select: { id: true, label: true } },
        variantSet: { select: { id: true, name: true, variants: true } },
        productLines: {
          include: {
            child: {
              select: {
                id: true,
                sku: true,
                name: true,
                type: true,
                supplier: { select: { id: true, name: true } },
              },
            },
          },
        },
        productTags: { include: { tag: true } },
      },
    });
    const taxCodesPromise = prismaBase.valueList.findMany({
      where: { type: "Tax" },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    });
    const categoriesPromise = prismaBase.valueList.findMany({
      where: { type: "Category" },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    });
    const companiesPromise = prismaBase.company.findMany({
      select: {
        id: true,
        name: true,
        isCustomer: true,
        isSupplier: true,
        isCarrier: true,
      },
      orderBy: { name: "asc" },
      take: 1000,
    });
    const productChoicesPromise = prismaBase.product.findMany({
      select: {
        id: true,
        sku: true,
        name: true,
        type: true,
        supplier: { select: { id: true, name: true } },
        _count: { select: { productLines: true } },
      },
      orderBy: { id: "asc" },
      take: 1000,
    });
    const movementLinesPromise = prismaBase.productMovementLine.findMany({
      where: { productId: id },
      include: {
        movement: {
          select: {
            id: true,
            movementType: true,
            date: true,
            locationId: true,
            locationInId: true,
            locationOutId: true,
            location: { select: { id: true, name: true } },
          },
        },
        batch: { select: { id: true, codeMill: true, codeSartor: true } },
      },
      orderBy: [{ movement: { date: "desc" } }, { id: "desc" }],
      take: 500,
    });
    const movementHeadersPromise = prismaBase.productMovement.findMany({
      where: { productId: id },
      select: {
        id: true,
        movementType: true,
        date: true,
        locationInId: true,
        locationOutId: true,
        quantity: true,
        notes: true,
      },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 500,
    });
    const [product, taxCodes, categories, companies, productChoices, movements, movementHeaders] = await Promise.all([
      productPromise.then((r) => {
        mark("product");
        return r;
      }),
      taxCodesPromise.then((r) => {
        mark("taxCodes");
        return r;
      }),
      categoriesPromise.then((r) => {
        mark("categories");
        return r;
      }),
      companiesPromise.then((r) => {
        mark("companies");
        return r;
      }),
      productChoicesPromise.then((r) => {
        mark("productChoices");
        return r;
      }),
      movementLinesPromise.then((r) => {
        mark("movementLines");
        return r;
      }),
      movementHeadersPromise.then((r) => {
        mark("movementHeaders");
        return r;
      }),
    ]);
    if (!product) throw new Response("Not found", { status: 404 });

    // Resolve location names for in/out in one query (lines + headers)
    const locIdSet = new Set<number>();
    for (const ml of movements as any[]) {
      const li = (ml?.movement?.locationInId ?? null) as number | null;
      const lo = (ml?.movement?.locationOutId ?? null) as number | null;
      if (typeof li === "number" && Number.isFinite(li)) locIdSet.add(li);
      if (typeof lo === "number" && Number.isFinite(lo)) locIdSet.add(lo);
    }
    for (const mh of movementHeaders as any[]) {
      const li = (mh?.locationInId ?? null) as number | null;
      const lo = (mh?.locationOutId ?? null) as number | null;
      if (typeof li === "number" && Number.isFinite(li)) locIdSet.add(li);
      if (typeof lo === "number" && Number.isFinite(lo)) locIdSet.add(lo);
    }
    const locIds = Array.from(locIdSet);
    const locs = locIds.length
      ? await prismaBase.location.findMany({
          where: { id: { in: locIds } },
          select: { id: true, name: true },
        })
      : [];
    mark("locations");
    const locationNameById = Object.fromEntries(locs.map((l) => [l.id, l.name ?? String(l.id)]));
    if (process.env.LOG_PERF?.includes("products")) {
      console.log("[perf] products.$id loader timings", { id, marks });
    }
    // Fetch stock snapshot from materialized view (single pre-aggregated source)
    const snapshot = await getProductStockSnapshots(id);
    return json({
      product,
      stockByLocation: (snapshot as any)?.byLocation || [],
      stockByBatch: (snapshot as any)?.byBatch || [],
      productChoices,
      movements,
      movementHeaders,
      locationNameById,
      taxCodeOptions: (taxCodes as Array<{ id: number; label: string | null }>).map((t) => ({
        value: t.id,
        label: t.label || String(t.id),
      })),
      categoryOptions: (categories as Array<{ id: number; label: string | null }>).map((c) => ({
        value: c.id,
        label: c.label || String(c.id),
      })),
      companyOptions: (
        companies as Array<{
          id: number;
          name: string | null;
          isCustomer: boolean | null;
          isSupplier: boolean | null;
          isCarrier: boolean | null;
        }>
      ).map((c) => ({
        value: c.id,
        label: c.name || String(c.id),
        isCustomer: !!c.isCustomer,
        isSupplier: !!c.isSupplier,
        isCarrier: !!c.isCarrier,
      })),
    });
  }); // end runWithDbActivity wrapper
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  // Support JSON batch actions (spreadsheet) when Content-Type is application/json
  let intent = "";
  let form: FormData | null = null;
  const ct = request.headers.get("content-type") || "";
  let jsonBody: any = null;
  if (ct.includes("application/json")) {
    try {
      jsonBody = await request.json();
      intent = String(jsonBody?._intent || "");
    } catch {
      // fall back to form parsing
    }
  }
  if (!intent) {
    form = await request.formData();
    intent = String(form.get("_intent") || "");
  }
  // Shared form processing to keep create/update consistent
  const buildProductData = (form: FormData) => {
    const data: any = {};
    const str = (k: string) => {
      if (form.has(k)) data[k] = (form.get(k) as string)?.trim() || null;
    };
    const num = (k: string) => {
      if (form.has(k)) {
        const v = form.get(k) as string;
        data[k] = v === "" || v == null ? null : Number(v);
      }
    };
    const bool = (k: string) => {
      if (form.has(k)) {
        const v = String(form.get(k));
        data[k] = v === "true" || v === "on";
      }
    };
    // strings
    str("sku");
    str("name");
    str("description");
    str("type");
    // numerics
    num("costPrice");
    num("manualSalePrice");
    num("autoSalePrice");
    num("purchaseTaxId");
    num("categoryId");
    num("customerId");
    num("supplierId");
    // booleans
    bool("stockTrackingEnabled");
    bool("batchTrackingEnabled");
    return data;
  };
  // Creation path: accept either explicit _intent or posting to /products/new
  if (isNew || intent === "create") {
    if (!form) form = await request.formData();
    const created = await prismaBase.product.create({
      data: buildProductData(form),
    });
    return redirect(`/products/${created.id}`);
  }
  if (intent === "find") {
    if (!form) form = await request.formData();
    const raw = Object.fromEntries(form.entries());
    const values: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      values[k] = v === "" ? null : v;
    }
    // Build where via config arrays
    const where = buildWhereFromConfig(values, [...productIdentityFields, ...productAssocFields, ...productPricingFields, ...productBomFindFields]);
    const first = await prismaBase.product.findFirst({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const sp = new URLSearchParams();
    sp.set("find", "1");
    const push = (k: string, v: any) => {
      if (v === undefined || v === null || v === "") return;
      sp.set(k, String(v));
    };
    push("sku", values.sku);
    push("name", values.name);
    push("description", values.description);
    push("type", values.type);
    push("costPriceMin", values.costPriceMin);
    push("costPriceMax", values.costPriceMax);
    push("manualSalePriceMin", values.manualSalePriceMin);
    push("manualSalePriceMax", values.manualSalePriceMax);
    push("purchaseTaxId", values.purchaseTaxId);
    push("categoryId", values.categoryId);
    push("customerId", values.customerId);
    push("supplierId", values.supplierId);
    if (values.stockTrackingEnabled === true || values.stockTrackingEnabled === "true") push("stockTrackingEnabled", "true");
    if (values.stockTrackingEnabled === false || values.stockTrackingEnabled === "false") push("stockTrackingEnabled", "false");
    if (values.batchTrackingEnabled === true || values.batchTrackingEnabled === "true") push("batchTrackingEnabled", "true");
    if (values.batchTrackingEnabled === false || values.batchTrackingEnabled === "false") push("batchTrackingEnabled", "false");
    push("componentChildSku", values.componentChildSku);
    push("componentChildName", values.componentChildName);
    push("componentChildSupplierId", values.componentChildSupplierId);
    push("componentChildType", values.componentChildType);
    const qs = sp.toString();
    if (first?.id != null) return redirect(`/products/${first.id}?${qs}`);
    return redirect(`/products?${qs}`);
  }
  if (intent === "update") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const data = buildProductData(form);
    await prismaBase.product.update({ where: { id }, data });
    return redirect(`/products/${id}`);
  }
  if (intent === "product.tags.replace") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const userId = await requireUserId(request);
    const names: string[] = Array.isArray(jsonBody?.names)
      ? jsonBody.names.map((n: any) => String(n))
      : Array.isArray((await request.formData()).getAll("names"))
      ? ((await request.formData()).getAll("names")).map((n) => String(n))
      : [];
    await replaceProductTags(id, names, userId);
    return json({ ok: true });
  }
  if (intent === "product.addComponent") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const childId = Number(form.get("childId"));
    if (Number.isFinite(childId)) {
      await prismaBase.productLine.create({
        data: { parentId: id, childId, quantity: 1 },
      });
    }
    return redirect(`/products/${id}`);
  }
  if (intent === "delete") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    await prismaBase.product.delete({ where: { id } });
    return redirect("/products");
  }
  if (intent === "bom.batch") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    if (!jsonBody) return json({ error: "Expected JSON body" }, { status: 400 });
    const updates: Array<{ id: number; quantity?: number; activityUsed?: string | null }> = Array.isArray(jsonBody.updates) ? jsonBody.updates : [];
    const creates: Array<{ childSku: string; quantity?: number; activityUsed?: string | null }> = Array.isArray(jsonBody.creates) ? jsonBody.creates : [];
    const deletes: number[] = Array.isArray(jsonBody.deletes) ? jsonBody.deletes.filter((n: any) => Number.isFinite(Number(n))).map(Number) : [];
    const skuSet = new Set<string>();
    for (const c of creates) if (c.childSku) skuSet.add(String(c.childSku).trim());
    // Resolve child SKUs to ids
    const skuArr = Array.from(skuSet).filter(Boolean);
    const children = skuArr.length ? await prismaBase.product.findMany({ where: { sku: { in: skuArr } }, select: { id: true, sku: true } }) : [];
    const idBySku = new Map(children.map((c) => [c.sku, c.id]));
    const createData: any[] = [];
    const unknownSkus: string[] = [];
    for (const c of creates) {
      const sku = c.childSku?.trim();
      if (!sku) continue;
      const childId = idBySku.get(sku);
      if (!childId) {
        unknownSkus.push(sku);
        continue; // skip unknown SKUs
      }
      createData.push({ parentId: id, childId, quantity: Number(c.quantity ?? 0) || 0, activityUsed: c.activityUsed || null });
    }
    const updateData = updates
      .filter((u) => Number.isFinite(u.id))
      .map((u) => ({
        where: { id: u.id },
        data: {
          ...(u.quantity !== undefined ? { quantity: Number(u.quantity) || 0 } : {}),
          activityUsed: u.activityUsed === undefined ? undefined : u.activityUsed || null,
        },
      }));
    // Execute in a transaction for consistency
    const results = await prismaBase.$transaction(async (tx) => {
      const created: any[] = [];
      if (createData.length) {
        for (const cd of createData) {
          const r = await tx.productLine.create({ data: cd });
          created.push(r);
        }
      }
      let updatedCount = 0;
      for (const upd of updateData) {
        if (Object.keys(upd.data).length === 0) continue;
        await tx.productLine.update(upd as any);
        updatedCount++;
      }
      let deletedCount = 0;
      if (deletes.length) {
        await tx.productLine.deleteMany({ where: { id: { in: deletes }, parentId: id } });
        deletedCount = deletes.length;
      }
      return { created: created.length, updated: updatedCount, deleted: deletedCount };
    });
    return json({ ok: true, ...results, unknownSkus });
  }
  return redirect(`/products/${id}`);
}

export default function ProductDetailRoute() {
  const { product, stockByLocation, stockByBatch, productChoices, movements, movementHeaders, locationNameById, taxCodeOptions, categoryOptions, companyOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // Sync RecordContext currentId for global navigation consistency
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(product.id);
    // Do NOT clear on unmount; preserve selection like invoices module
  }, [product.id, setCurrentId]);
  // Prev/Next hotkeys handled globally in RecordProvider
  const submit = useSubmit();

  // Findify hook (forms, mode, style, helpers) – pass nav for auto-exit
  const { editForm, buildUpdatePayload } = useProductFindify(product, nav);

  // Find modal is handled via ProductFindManager now (no inline find toggle)

  // Only wire header Save/Cancel to the real edit form
  const saveUpdate = useCallback(
    (values: any) => {
      const updatePayload = buildUpdatePayload(values);
      console.log("Saving with payload", updatePayload);
      submit(updatePayload, { method: "post" });
    },
    [buildUpdatePayload, submit]
  );
  useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

  const [pickerOpen, setPickerOpen] = useState(false);
  // Spreadsheet BOM modal state
  const [bomModalOpen, setBomModalOpen] = useState(false);
  const initialSheet = useMemo(
    () =>
      (product.productLines || []).map((pl: any) => ({
        id: pl.id,
        childId: pl.childId,
        childSku: pl.child?.sku || "",
        childName: pl.child?.name || "",
        activityUsed: pl.activityUsed || "",
        type: pl.child?.type || "",
        supplier: pl.child?.supplier?.name || "",
        quantity: Number(pl.quantity ?? 0) || 0,
      })),
    [product.productLines]
  );
  const [sheetRows, setSheetRows] = useState<any[]>(initialSheet);
  const [dirtySheet, setDirtySheet] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  // Keep sheetRows in sync with product lines; also refresh when modal opens so it always has data
  useEffect(() => {
    setSheetRows(initialSheet);
    setDirtySheet(false);
  }, [initialSheet]);
  useEffect(() => {
    if (bomModalOpen) {
      setSheetRows(initialSheet);
      setDirtySheet(false);
    }
  }, [bomModalOpen, initialSheet]);
  const skuToChildInfo = useMemo(() => {
    const m = new Map<string, { id: number; name: string; type: string; supplier: string }>();
    (productChoices as any[]).forEach((p: any) => {
      m.set(p.sku || "", { id: p.id, name: p.name || "", type: (p as any).type || "", supplier: (p as any).supplier?.name || "" });
    });
    return m;
  }, [productChoices]);
  const sheetColumns = useMemo<Column<BOMRow>[]>(() => {
    // Use keyColumn + textColumn to gain built-in clipboard support
    const idCol = {
      ...keyColumn<BOMRow, any>("id", textColumn),
      id: "id",
      title: "ID",
      disabled: true,
    } as Column<BOMRow>;

    const skuBase = keyColumn<BOMRow, any>("childSku", textColumn) as Column<BOMRow>;
    const skuCol: Column<BOMRow> = {
      ...skuBase,
      id: "childSku",
      title: "SKU",
      component: ({ rowData, setRowData, focus }) => (
        <input
          list="bom-sku-list"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent" }}
          value={rowData.childSku || ""}
          onChange={(e) => {
            const sku = e.target.value;
            const info = skuToChildInfo.get(sku);
            setRowData({
              ...rowData,
              childSku: sku,
              childName: info?.name || "",
              type: info?.type || rowData.type,
              supplier: info?.supplier || rowData.supplier,
            });
          }}
          autoFocus={focus}
        />
      ),
    };

    const nameCol = {
      ...keyColumn<BOMRow, any>("childName", textColumn),
      id: "childName",
      title: "Name",
      disabled: true,
    } as Column<BOMRow>;

    const usageCol = {
      ...keyColumn<BOMRow, any>("activityUsed", textColumn),
      id: "activityUsed",
      title: "Usage",
    } as Column<BOMRow>;

    const typeCol = {
      ...keyColumn<BOMRow, any>("type", textColumn),
      id: "type",
      title: "Type",
      disabled: true,
    } as Column<BOMRow>;

    const supplierCol = {
      ...keyColumn<BOMRow, any>("supplier", textColumn),
      id: "supplier",
      title: "Supplier",
      disabled: true,
    } as Column<BOMRow>;

    const qtyBase = keyColumn<BOMRow, any>("quantity", textColumn) as Column<BOMRow>;
    const qtyCol: Column<BOMRow> = {
      ...qtyBase,
      id: "quantity",
      title: "Qty",
      component: ({ rowData, setRowData, focus }) => (
        <input
          type="number"
          style={{ width: "100%", border: "none", outline: "none", background: "transparent", textAlign: "right" }}
          value={rowData.quantity ?? ""}
          onChange={(e) => setRowData({ ...rowData, quantity: e.target.value === "" ? "" : Number(e.target.value) })}
          min={0}
          autoFocus={focus}
        />
      ),
    };

    return [idCol, skuCol, nameCol, usageCol, typeCol, supplierCol, qtyCol];
  }, [skuToChildInfo]);
  const commitSheetChanges = async () => {
    setSavingSheet(true);
    try {
      const existingById = new Map<number, any>();
      for (const pl of product.productLines) existingById.set(pl.id, pl);
      const updates: any[] = [];
      const creates: any[] = [];
      const keptIds = new Set<number>();
      for (const r of sheetRows) {
        if (r.id && existingById.has(r.id)) {
          keptIds.add(r.id);
          const orig = existingById.get(r.id);
          if (orig.quantity !== r.quantity || (orig.activityUsed || "") !== r.activityUsed) {
            updates.push({ id: r.id, quantity: r.quantity, activityUsed: r.activityUsed || null });
          }
        } else if (!r.id && r.childSku) {
          creates.push({ childSku: r.childSku, quantity: r.quantity || 0, activityUsed: r.activityUsed || null });
        }
      }
      const deletes = Array.from(existingById.keys()).filter((id) => !keptIds.has(id));
      const resp = await fetch(`/products/${product.id}?indexAction=1`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _intent: "bom.batch", productId: product.id, updates, creates, deletes }),
      });
      if (!resp.ok) throw new Error("Failed to save");
      const data = await resp.json();
      if (data?.unknownSkus?.length) {
        alert(`Unknown SKUs: ${data.unknownSkus.join(", ")}`);
      }
      setDirtySheet(false);
      setBomModalOpen(false);
    } catch (e) {
      console.error("BOM save failed", e);
    } finally {
      setSavingSheet(false);
    }
  };
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  // Movements view: header-level ProductMovement vs line-level ProductMovementLine
  const [movementView, setMovementView] = useState<"header" | "line">("line");
  // Tags state
  const initialTagNames = useMemo(
    () => (product.productTags || []).map((pt: any) => pt?.tag?.name).filter(Boolean) as string[],
    [product.productTags]
  );
  const [tagNames, setTagNames] = useState<string[]>(initialTagNames);
  useEffect(() => {
    setTagNames(initialTagNames);
  }, [initialTagNames]);
  const [newTag, setNewTag] = useState("");
  // Batch filters
  const [batchScope, setBatchScope] = useState<"all" | "current">("current");
  const [batchLocation, setBatchLocation] = useState<string>("all");
  const batchLocationOptions = useMemo(() => {
    const set = new Set<string>();
    (stockByBatch || []).forEach((row: any) => {
      const name = row.location_name || (row.location_id ? `#${row.location_id}` : "(none)");
      set.add(name);
    });
    const arr = Array.from(set);
    return [{ value: "all", label: "All" }, ...arr.map((n) => ({ value: n, label: n }))];
  }, [stockByBatch]);
  const filteredBatches = useMemo(() => {
    return (stockByBatch || []).filter((row: any) => {
      const qty = Number(row.qty ?? 0);
      const name = row.location_name || (row.location_id ? `#${row.location_id}` : "(none)");
      const scopeOk = batchScope === "all" || qty !== 0;
      const locOk = batchLocation === "all" || name === batchLocation;
      return scopeOk && locOk;
    });
  }, [stockByBatch, batchScope, batchLocation]);
  const filtered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    let arr = productChoices as any[];
    if (q) arr = arr.filter((p) => ((p.sku || "") + " " + (p.name || "")).toLowerCase().includes(q));
    if (assemblyItemOnly) arr = arr.filter((p) => (p._count?.productLines ?? 0) === 0);
    return arr;
  }, [productChoices, pickerSearch, assemblyItemOnly]);

  // Normalize arrays/records for safe rendering across loader branches
  const lines = useMemo(() => ((movements as any[]) || []).filter(Boolean), [movements]);
  const headers = useMemo(() => ((movementHeaders as any[]) || []).filter(Boolean), [movementHeaders]);
  const locById = useMemo(() => (locationNameById as any as Record<number | string, string>) || {}, [locationNameById]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Products", href: "/products" },
            { label: String(product.id), href: `/products/${product.id}` },
          ]}
        />
        <Group gap="xs"></Group>
      </Group>
      <ProductFindManager />
      <Form id="product-form" method="post">
        <ProductDetailForm
          mode={"edit" as any}
          form={editForm as any}
          product={product}
          categoryOptions={(categoryOptions as any).map((o: any) => ({
            value: String(o.value),
            label: o.label,
          }))}
          taxCodeOptions={(taxCodeOptions as any).map((o: any) => ({
            value: String(o.value),
            label: o.label,
          }))}
        />
      </Form>
      {/* Tags */}
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={4}>Tags</Title>
            <Group gap="xs">
              <Button
                size="xs"
                variant="light"
                onClick={async () => {
                  // Save current edited tags
                  const resp = await fetch(`/products/${product.id}?indexAction=1`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ _intent: "product.tags.replace", names: tagNames }),
                  });
                  if (resp.ok) window.location.reload();
                }}
              >
                Save Tags
              </Button>
              <Button
                size="xs"
                variant="subtle"
                onClick={() => setTagNames(initialTagNames)}
              >
                Reset
              </Button>
            </Group>
          </Group>
        </Card.Section>
        <Stack gap="xs">
          <Group align="flex-end">
            <div style={{ flex: 1 }}>
              <TagPicker value={tagNames} onChange={setTagNames} />
            </div>
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                const n = newTag.trim();
                if (!n) return;
                if (!tagNames.includes(n)) setTagNames((prev) => [...prev, n]);
                setNewTag("");
              }}
            >
              <Group gap="xs">
                <TextInput placeholder="New tag" value={newTag} onChange={(e) => setNewTag(e.currentTarget.value)} />
                <Button type="submit" variant="light" size="xs">
                  Add
                </Button>
              </Group>
            </Form>
          </Group>
          <Group>
            {(product.productTags || []).map((pt: any) => (
              <Badge key={pt.id} variant="light">
                {pt.tag?.name}
              </Badge>
            ))}
            {(!product.productTags || product.productTags.length === 0) && (
              <Text c="dimmed">No tags</Text>
            )}
          </Group>
        </Stack>
      </Card>
      {/* Bill of Materials */}
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Group gap="sm" align="center">
              <Title order={4}>Bill of Materials</Title>
              <Button size="xs" variant="light" onClick={() => setBomModalOpen(true)}>
                Edit in Sheet
              </Button>
            </Group>
            <Button variant="light" onClick={() => setPickerOpen(true)}>
              Add Component
            </Button>
          </Group>
        </Card.Section>
        {product.productLines.length > 0 && (
          <Table striped withTableBorder withColumnBorders highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>SKU</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Usage</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Supplier</Table.Th>
                <Table.Th>Qty</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {product.productLines.map((pl: any) => (
                <Table.Tr key={pl.id}>
                  <Table.Td>{pl.id}</Table.Td>
                  <Table.Td>{pl.child?.sku || ""}</Table.Td>
                  <Table.Td>{pl.child ? <Link to={`/products/${pl.child.id}`}>{pl.child.name || pl.child.id}</Link> : pl.childId}</Table.Td>
                  <Table.Td>{pl.activityUsed || ""}</Table.Td>
                  <Table.Td>{pl.child?.type || ""}</Table.Td>
                  <Table.Td>{pl.child?.supplier?.name || ""}</Table.Td>
                  <Table.Td>{pl.quantity}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
      <datalist id="bom-sku-list">
        {(productChoices as any[]).map((p: any) => (
          <option key={p.id} value={p.sku}>
            {p.name}
          </option>
        ))}
      </datalist>
      <HotkeyAwareModal opened={bomModalOpen} onClose={() => setBomModalOpen(false)} title="Edit Bill of Materials" size="90vw" centered>
        <Stack>
          <Group justify="space-between" align="center">
            <Text c="dimmed">Type a SKU (autocomplete). Remove a row to delete. Unknown SKUs will be reported.</Text>
            <Group>
              <Button variant="default" onClick={() => setBomModalOpen(false)} disabled={savingSheet}>
                Cancel
              </Button>
              <Button color="green" onClick={commitSheetChanges} loading={savingSheet} disabled={!dirtySheet}>
                Save Changes
              </Button>
            </Group>
          </Group>
          <div className="bom-sheet-wrapper" style={{ border: "1px solid var(--mantine-color-gray-4)", borderRadius: 4, overflow: "hidden" }}>
            <DataSheetGrid
              key={bomModalOpen ? "open" : "closed"}
              className="bom-sheet"
              value={sheetRows}
              onChange={(rows) => {
                setSheetRows(rows as any);
                setDirtySheet(true);
              }}
              columns={sheetColumns}
              height={480}
              createRow={() => ({ id: null, childSku: "", childName: "", activityUsed: "", type: "", supplier: "", quantity: 1 })}
            />
          </div>
          <Stack gap={4} mt="sm">
            <Text size="sm" c="dimmed">
              Quick remove
            </Text>
            <div style={{ maxHeight: 120, overflow: "auto" }}>
              {sheetRows.map((r, idx) => (
                <Group key={`${r.id ?? "new"}-${idx}`} justify="space-between" py={2}>
                  <Text size="sm" style={{ flex: 1 }}>
                    {r.childSku || "(new)"} — {r.childName}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      setSheetRows((prev) => prev.filter((_, i) => i !== idx));
                      setDirtySheet(true);
                    }}
                  >
                    Remove
                  </Button>
                </Group>
              ))}
            </div>
          </Stack>
        </Stack>
      </HotkeyAwareModal>
      {/* Legacy BOM find criteria block removed (now handled via modal) */}
      {/* Stock + Movements */}
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            {/* Stock by Location + Batch (left) */}
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Group justify="space-between" align="center">
                  <Title order={4}>Stock by Location</Title>
                  <Badge variant="light">Global: {Number((product as any).stockQty ?? 0)}</Badge>
                </Group>
              </Card.Section>
              <Table striped withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Qty</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(stockByLocation || []).map((row: any) => (
                    <Table.Tr key={row.location_id ?? "none"}>
                      <Table.Td>{row.location_name || `${row.location_id ?? "(none)"}`}</Table.Td>
                      <Table.Td>{Number(row.qty ?? 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
            {/* Stock by Batch */}
            <Card withBorder padding="md">
              <Card.Section inheritPadding py="xs">
                <Group justify="space-between" align="center" px={8} pb={6}>
                  <Title order={5}>Stock by Batch</Title>
                  <Group gap="sm" wrap="wrap"></Group>
                </Group>
              </Card.Section>
              <Table striped withTableBorder withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Batch Codes</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Location</Table.Th>
                    <Table.Th>Received</Table.Th>
                    <Table.Th>Qty</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredBatches.map((row: any) => (
                    <Table.Tr key={row.batch_id}>
                      <Table.Td>
                        {row.code_mill || row.code_sartor ? (
                          <>
                            {row.code_mill || ""}
                            {row.code_sartor ? (row.code_mill ? " | " : "") + row.code_sartor : ""}
                          </>
                        ) : (
                          `${row.batch_id}`
                        )}
                      </Table.Td>
                      <Table.Td>{row.batch_name || ""}</Table.Td>
                      <Table.Td>{row.location_name || (row.location_id ? `${row.location_id}` : "")}</Table.Td>
                      <Table.Td>{row.received_at ? new Date(row.received_at).toLocaleDateString() : ""}</Table.Td>
                      <Table.Td>{Number(row.qty ?? 0)}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Card>
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          {/* Product Movements (right) */}
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={4}>Product Movements</Title>
                {/* view switch removed */}
              </Group>
            </Card.Section>
            <Table striped withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Date</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Out</Table.Th>
                  <Table.Th>In</Table.Th>
                  {movementView === "line" && <Table.Th>Batch</Table.Th>}
                  <Table.Th>Qty</Table.Th>
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {movementView === "line"
                  ? lines.map((ml: any) => (
                      <Table.Tr key={`line-${ml.id}`}>
                        <Table.Td>{ml.movement?.date ? new Date(ml.movement.date).toLocaleDateString() : ""}</Table.Td>
                        <Table.Td>{ml.movement?.movementType || ""}</Table.Td>
                        <Table.Td>{ml.movement?.locationOutId != null ? locById?.[ml.movement.locationOutId] || ml.movement.locationOutId : ""}</Table.Td>
                        <Table.Td>{ml.movement?.locationInId != null ? locById?.[ml.movement.locationInId] || ml.movement.locationInId : ""}</Table.Td>
                        <Table.Td>
                          {ml.batch?.codeMill || ml.batch?.codeSartor
                            ? `${ml.batch?.codeMill || ""}${ml.batch?.codeMill && ml.batch?.codeSartor ? " | " : ""}${ml.batch?.codeSartor || ""}`
                            : ml.batch?.id
                            ? `${ml.batch.id}`
                            : ""}
                        </Table.Td>
                        <Table.Td>{ml.quantity ?? ""}</Table.Td>
                        <Table.Td>{ml.notes || ""}</Table.Td>
                      </Table.Tr>
                    ))
                  : headers.map((mh: any) => (
                      <Table.Tr key={`hdr-${mh.id}`}>
                        <Table.Td>{mh.date ? new Date(mh.date).toLocaleDateString() : ""}</Table.Td>
                        <Table.Td>{mh.movementType || ""}</Table.Td>
                        <Table.Td>{mh.locationOutId != null ? locById?.[mh.locationOutId] || mh.locationOutId : ""}</Table.Td>
                        <Table.Td>{mh.locationInId != null ? locById?.[mh.locationInId] || mh.locationInId : ""}</Table.Td>
                        <Table.Td>{mh.quantity ?? ""}</Table.Td>
                        <Table.Td>{mh.notes || ""}</Table.Td>
                      </Table.Tr>
                    ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
      {/* Add Component Picker (single instance near top return) */}
      <HotkeyAwareModal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add Component" size="xl" centered>
        <Stack>
          <Group justify="space-between" align="flex-end">
            <TextInput placeholder="Search products..." value={pickerSearch} onChange={(e) => setPickerSearch(e.currentTarget.value)} w={320} />
            <Checkbox label="Assembly Item" checked={assemblyItemOnly} onChange={(e) => setAssemblyItemOnly(e.currentTarget.checked)} />
          </Group>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {filtered.map((p: any) => (
              <Group
                key={p.id}
                py={6}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("_intent", "product.addComponent");
                  fd.set("childId", String(p.id));
                  submit(fd, { method: "post" });
                  setPickerOpen(false);
                }}
                style={{ cursor: "pointer" }}
              >
                <Text w={60}>{p.id}</Text>
                <Text w={160}>{p.sku}</Text>
                <Text style={{ flex: 1 }}>{p.name}</Text>
              </Group>
            ))}
          </div>
        </Stack>
      </HotkeyAwareModal>
      <Form method="post">
        <input type="hidden" name="_intent" value="delete" />
        <Button color="red" variant="light" type="submit" disabled={busy}>
          {busy ? "Deleting..." : "Delete product"}
        </Button>
      </Form>
    </Stack>
  );
}
