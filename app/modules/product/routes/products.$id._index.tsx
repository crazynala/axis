import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useFindHrefAppender } from "~/base/find/sessionFindState";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Menu,
  ActionIcon,
  Anchor,
  TagsInput,
  Select,
  SegmentedControl,
  Grid,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Modal,
} from "@mantine/core";
import { IconMenu2 } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Form,
  Link,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useRevalidator,
  useSubmit,
} from "@remix-run/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
// BOM spreadsheet moved to full-page route: /products/:id/bom
import { ProductPickerModal } from "~/modules/product/components/ProductPickerModal";
import { useRecordContext } from "~/base/record/RecordContext";
import {
  InventoryAmendmentModal,
  type BatchRowLite,
} from "~/components/InventoryAmendmentModal";
import {
  InventoryTransferModal,
  type BatchOption,
} from "~/components/InventoryTransferModal";
import { TagPicker } from "~/components/TagPicker";
import {
  buildProductEditDefaults,
  useProductFindify,
} from "~/modules/product/findify/productFindify";
import { requireUserId } from "~/utils/auth.server";
import { buildWhereFromConfig } from "~/utils/buildWhereFromConfig.server";
import { ProductDetailForm } from "../components/ProductDetailForm";
import { ProductFindManager } from "../components/ProductFindManager";
import {
  productAssocFields,
  productBomFindFields,
  productIdentityFields,
  productPricingFields,
} from "../forms/productDetail";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
  getSavedIndexSearch,
} from "~/hooks/useNavLocation";

// BOM spreadsheet modal removed; see /products/:id/bom page

const PRODUCT_DELETE_PHRASE = "LET'S DO IT";

export async function loader({ params }: LoaderFunctionArgs) {
  const { runWithDbActivity, prismaBase } = await import(
    "~/utils/prisma.server"
  );
  const { getProductStockSnapshots } = await import("~/utils/prisma.server");
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
        customer: { select: { id: true, priceMultiplier: true } },
        // supplier: { select: { id: true, name: true } },
        // customer: { select: { id: true, name: true } },
        // purchaseTax: { select: { id: true, label: true } },
        // category: { select: { id: true, label: true } },
        // variantSet: { select: { id: true, name: true, variants: true } },
        costGroup: { include: { costRanges: true } },
        // For pricing preview/defaults in form
        salePriceGroup: { include: { saleRanges: true } },
        salePriceRanges: true,
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
    // Option lists (tax/category/company) are provided via OptionsContext globally;
    // no need to query them in this route loader anymore.
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
    const salePriceGroupsPromise = prismaBase.salePriceGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    const [
      product,
      productChoices,
      movements,
      movementHeaders,
      salePriceGroups,
    ] = await Promise.all([
      productPromise.then((r) => {
        mark("product");
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
      salePriceGroupsPromise.then((r) => r),
    ]);
    if (!product) return redirect("/products");

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
    const locationNameById = Object.fromEntries(
      locs.map((l) => [l.id, l.name ?? String(l.id)])
    );
    if (process.env.LOG_PERF?.includes("products")) {
      console.log("[perf] products.$id loader timings", { id, marks });
    }
    // Fetch stock snapshot from materialized view (single pre-aggregated source)
    const snapshot = await getProductStockSnapshots(id);
    // Normalize snapshot to snake_case keys expected by UI
    const stockByLocation = ((snapshot as any)?.byLocation || []).map(
      (l: any) => ({
        location_id: l.locationId ?? null,
        location_name: l.locationName ?? "",
        qty: l.qty ?? 0,
      })
    );
    const stockByBatch = ((snapshot as any)?.byBatch || []).map((b: any) => ({
      batch_id: b.batchId ?? null,
      code_mill: b.codeMill ?? "",
      code_sartor: b.codeSartor ?? "",
      batch_name: b.batchName ?? "",
      received_at: b.receivedAt ?? null,
      location_id: b.locationId ?? null,
      location_name: b.locationName ?? "",
      qty: b.qty ?? 0,
    }));
    return json({
      product,
      stockByLocation,
      stockByBatch,
      productChoices,
      movements,
      movementHeaders,
      locationNameById,
      salePriceGroups,
    });
  }); // end runWithDbActivity wrapper
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { prismaBase, refreshProductStockSnapshot } = await import(
    "~/utils/prisma.server"
  );
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id =
    !isNew && idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
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
  // Defer to helpers for data shaping and side-effects
  const { buildProductData } = await import(
    "~/modules/product/services/productForm.server"
  );
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
    const where = buildWhereFromConfig(values, [
      ...productIdentityFields,
      ...productAssocFields,
      ...productPricingFields,
      ...productBomFindFields,
    ]);
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
    if (
      values.stockTrackingEnabled === true ||
      values.stockTrackingEnabled === "true"
    )
      push("stockTrackingEnabled", "true");
    if (
      values.stockTrackingEnabled === false ||
      values.stockTrackingEnabled === "false"
    )
      push("stockTrackingEnabled", "false");
    if (
      values.batchTrackingEnabled === true ||
      values.batchTrackingEnabled === "true"
    )
      push("batchTrackingEnabled", "true");
    if (
      values.batchTrackingEnabled === false ||
      values.batchTrackingEnabled === "false"
    )
      push("batchTrackingEnabled", "false");
    push("componentChildSku", values.componentChildSku);
    push("componentChildName", values.componentChildName);
    push("componentChildSupplierId", values.componentChildSupplierId);
    push("componentChildType", values.componentChildType);
    const qs = sp.toString();
    if (first?.id != null) return redirect(`/products/${first.id}?${qs}`);
    return redirect(`/products?${qs}`);
  }
  if (intent === "update") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const data = buildProductData(form);
    await prismaBase.product.update({ where: { id }, data });
    // Handle tags if provided via global form
    try {
      const raw = form.get("tagNames") as string | null;
      if (raw != null) {
        let names: string[] = [];
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) names = parsed.map((s) => String(s));
        } catch {}
        const userId = await requireUserId(request);
        const { replaceProductTagsByNames } = await import(
          "~/modules/product/services/productTags.server"
        );
        await replaceProductTagsByNames(id, names, userId as any);
      }
    } catch (e) {
      console.warn("Failed to update product tags from form", e);
    }
    return redirect(`/products/${id}`);
  }
  if (intent === "price.preview") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    const qty = Number((form || (await request.formData())).get("qty"));
    const customerIdRaw = (form || (await request.formData())).get(
      "customerId"
    ) as string | null;
    const customerId = customerIdRaw ? Number(customerIdRaw) : null;
    const { priceProduct } = await import(
      "~/modules/product/pricing/pricingService.server"
    );
    const result = await priceProduct({
      productId: id,
      qty: Number.isFinite(qty) ? qty : 60,
      customerId,
    });
    return json(result);
  }
  if (intent === "stock.refresh") {
    const { refreshStockSnapshotSafe } = await import(
      "~/modules/product/services/productStock.server"
    );
    const res = await refreshStockSnapshotSafe();
    if (!res.ok) return json(res, { status: 500 });
    return json(res);
  }
  if (intent === "product.tags.replace") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    const userId = await requireUserId(request);
    const names: string[] = Array.isArray(jsonBody?.names)
      ? jsonBody.names.map((n: any) => String(n))
      : Array.isArray((await request.formData()).getAll("names"))
      ? (await request.formData()).getAll("names").map((n) => String(n))
      : [];
    const { replaceProductTagsByNames } = await import(
      "~/modules/product/services/productTags.server"
    );
    await replaceProductTagsByNames(id, names, userId as any);
    return json({ ok: true });
  }
  if (intent === "product.addComponent") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    if (!form) form = await request.formData();
    const childId = Number(form.get("childId"));
    if (Number.isFinite(childId)) {
      await prismaBase.productLine.create({
        data: { parentId: id, childId, quantity: 1 },
      });
    }
    return redirect(`/products/${id}`);
  }
  if (intent === "batch.editMeta") {
    if (!Number.isFinite(id))
      return json(
        { intent: "batch.editMeta", error: "Invalid product id" },
        { status: 400 }
      );
    const f = form || (await request.formData());
    const batchId = Number(f.get("batchId"));
    if (!Number.isFinite(batchId))
      return json(
        { intent: "batch.editMeta", error: "Invalid batch id" },
        { status: 400 }
      );
    const normalize = (value: unknown) => {
      if (value == null) return null;
      const trimmed = String(value).trim();
      return trimmed === "" ? null : trimmed;
    };
    const data: {
      name: string | null;
      codeMill: string | null;
      codeSartor: string | null;
    } = {
      name: normalize(f.get("name")),
      codeMill: normalize(f.get("codeMill")),
      codeSartor: normalize(f.get("codeSartor")),
    };
    const result = await prismaBase.batch.updateMany({
      where: { id: batchId, productId: id },
      data,
    });
    if (result.count === 0) {
      return json(
        {
          intent: "batch.editMeta",
          error: "Batch not found for this product.",
        },
        { status: 404 }
      );
    }
    try {
      // Keep snapshot-driven batch metadata in sync for the revalidated loader.
      await refreshProductStockSnapshot(false);
    } catch (err) {
      console.warn("Failed to refresh stock snapshot", err);
    }
    return json({ ok: true });
  }
  if (intent === "delete") {
    if (!Number.isFinite(id))
      return json(
        { error: "Invalid product id", intent: "delete" },
        { status: 400 }
      );
    const f = form || (await request.formData());
    const confirmationRaw = String(f.get("confirmDelete") || "");
    const normalized = confirmationRaw.replace(/\u2019/g, "'").trim();
    if (normalized !== PRODUCT_DELETE_PHRASE) {
      return json(
        {
          intent: "delete",
          error: `Type ${PRODUCT_DELETE_PHRASE} to confirm deletion.`,
        },
        { status: 400 }
      );
    }
    await prismaBase.product.delete({ where: { id } });
    return redirect("/products");
  }
  if (intent === "inventory.amend.batch") {
    const f = form || (await request.formData());
    const productId = Number(f.get("productId"));
    const batchId = Number(f.get("batchId"));
    const locationIdRaw = f.get("locationId") as string | null;
    const locationId = locationIdRaw ? Number(locationIdRaw) : null;
    const dateStr = String(f.get("date") || "");
    const delta = Number(f.get("delta"));
    const date = dateStr ? new Date(dateStr) : new Date();
    const { amendBatch } = await import(
      "~/modules/product/services/productInventory.server"
    );
    await amendBatch(
      Number.isFinite(productId) ? productId : null,
      batchId,
      locationId,
      date,
      delta
    );
    return redirect(`/products/${params.id}`);
  }
  if (intent === "inventory.amend.product") {
    const f = form || (await request.formData());
    const productId = Number(params.id);
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    let changes: Array<{
      batchId: number;
      locationId: number | null;
      delta: number;
    }> = [];
    let creates: Array<{
      name?: string | null;
      codeMill?: string | null;
      codeSartor?: string | null;
      locationId: number | null;
      qty: number;
    }> = [];
    try {
      const cStr = String(f.get("changes") || "[]");
      const parsed = JSON.parse(cStr);
      if (Array.isArray(parsed)) changes = parsed;
    } catch {}
    try {
      const cStr = String(f.get("creates") || "[]");
      const parsed = JSON.parse(cStr);
      if (Array.isArray(parsed)) creates = parsed;
    } catch {}
    const { amendProductBulk } = await import(
      "~/modules/product/services/productInventory.server"
    );
    await amendProductBulk(productId, date, changes, creates);
    return redirect(`/products/${params.id}`);
  }
  if (intent === "inventory.transfer.batch") {
    const productId = Number(params.id);
    const f = form || (await request.formData());
    const sourceBatchId = Number(f.get("sourceBatchId"));
    const qty = Number(f.get("qty"));
    const dateStr = String(f.get("date") || "");
    const date = dateStr ? new Date(dateStr) : new Date();
    const mode = String(f.get("mode") || "existing");
    const { transferBetweenBatches } = await import(
      "~/modules/product/services/productInventory.server"
    );
    if (mode === "existing") {
      await transferBetweenBatches(productId, sourceBatchId, qty, date, {
        mode: "existing",
        targetBatchId: Number(f.get("targetBatchId")),
      });
    } else {
      await transferBetweenBatches(productId, sourceBatchId, qty, date, {
        mode: "new",
        name: (f.get("targetName") as string) || null,
        codeMill: (f.get("targetCodeMill") as string) || null,
        codeSartor: (f.get("targetCodeSartor") as string) || null,
        locationId: ((): number | null => {
          const raw = f.get("targetLocationId") as string | null;
          return raw ? Number(raw) : null;
        })(),
      });
    }
    return redirect(`/products/${params.id}`);
  }
  if (intent === "bom.batch") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    if (!jsonBody)
      return json({ error: "Expected JSON body" }, { status: 400 });
    const updates = Array.isArray(jsonBody.updates) ? jsonBody.updates : [];
    const creates = Array.isArray(jsonBody.creates) ? jsonBody.creates : [];
    const deletes: number[] = Array.isArray(jsonBody.deletes)
      ? jsonBody.deletes
          .filter((n: any) => Number.isFinite(Number(n)))
          .map(Number)
      : [];
    const { applyBomBatch } = await import(
      "~/modules/product/services/productBom.server"
    );
    const result = await applyBomBatch(id, updates, creates, deletes);
    return json(result);
  }
  return redirect(`/products/${id}`);
}

// Client-only helper to wire the global form context with stable callbacks
function GlobalFormInit({
  form,
  onSave,
}: {
  form: any;
  onSave: (values: any) => void;
}) {
  const resetForm = useCallback(() => form.reset(), [form]);
  // Call the timber hook with stable callbacks
  useInitGlobalFormContext(form as any, onSave, resetForm);
  return null;
}

function DeferredGlobalFormInit({
  form,
  onSave,
  onReset,
}: {
  form: any;
  onSave: (values: any) => void;
  onReset: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  // Call the timber hook only after initial mount to avoid HMR timing issues
  useInitGlobalFormContext(form as any, onSave, onReset);
  return null;
}

export default function ProductDetailRoute() {
  // Persist last visited product detail path for module restoration (include search for tab states)
  useRegisterNavLocation({ includeSearch: true, moduleKey: "products" });
  // Keep index search cached; detail route should not overwrite index search so we call persist here only when user returns to index later.
  // This hook is safe on detail; it only acts if pathname === /products
  usePersistIndexSearch("/products");
  const {
    product,
    stockByLocation,
    stockByBatch,
    productChoices,
    movements,
    movementHeaders,
    locationNameById,
    salePriceGroups,
  } = useLoaderData<typeof loader>();
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
  useEffect(() => {
    editForm.reset(buildProductEditDefaults(product), {
      keepDirty: false,
      keepDefaultValues: false,
    });
  }, [product]);

  console.log("!! form values:", editForm.getValues());
  console.log(
    "!! form dirty:",
    editForm.formState.isDirty,
    editForm.formState.dirtyFields,
    editForm.formState.defaultValues
  );

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
  // Defer initialization to avoid HMR race where provider isn't ready yet
  // useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

  const [pickerOpen, setPickerOpen] = useState(false);
  // BOM spreadsheet modal removed (now a dedicated full-page route)
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  // Movements view: header-level ProductMovement vs line-level ProductMovementLine
  const [movementView, setMovementView] = useState<"header" | "line">("line");
  const [showAllMovements, setShowAllMovements] = useState(false);
  useEffect(() => {
    // Collapse when navigating to a different product
    setShowAllMovements(false);
  }, [product.id]);
  useEffect(() => {
    setDeleteConfirmation("");
    setDeleteModalOpen(false);
  }, [product.id]);
  // Tags handled via global editForm (TagsInput in header)
  // Fetcher-based refresh for MV
  const refreshFetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const { revalidate } = useRevalidator();
  useEffect(() => {
    if (refreshFetcher.state === "idle" && refreshFetcher.data) {
      if (refreshFetcher.data.ok) {
        notifications.show({
          color: "teal",
          title: "Stock refreshed",
          message: "Materialized view recalculation complete.",
        });
        revalidate();
      } else if (refreshFetcher.data.error) {
        notifications.show({
          color: "red",
          title: "Refresh failed",
          message: "Could not refresh stock view.",
        });
      }
    }
  }, [refreshFetcher.state, refreshFetcher.data, revalidate]);
  // Batch filters
  const [batchScope, setBatchScope] = useState<"all" | "current">("current");
  const [batchLocation, setBatchLocation] = useState<string>("all");
  const batchLocationOptions = useMemo(() => {
    const set = new Set<string>();
    (stockByBatch || []).forEach((row: any) => {
      const name =
        row.location_name ||
        (row.location_id ? `#${row.location_id}` : "(none)");
      // console.log("!! adding location name to set:", name);
      set.add(name);
    });
    const arr = Array.from(set);
    return [
      { value: "all", label: "All" },
      ...arr.map((n) => ({ value: n, label: n })),
    ];
  }, [stockByBatch]);
  const filteredBatches = useMemo(() => {
    return (stockByBatch || []).filter((row: any) => {
      const qty = Number(row.qty ?? 0);
      const name =
        row.location_name ||
        (row.location_id ? `#${row.location_id}` : "(none)");
      const scopeOk = batchScope === "all" || qty !== 0;
      const locOk = batchLocation === "all" || name === batchLocation;
      return scopeOk && locOk;
    });
  }, [stockByBatch, batchScope, batchLocation]);
  const filteredBatchRowsLite = useMemo<BatchRowLite[]>(() => {
    return filteredBatches.map((row: any) => ({
      batchId: Number(row.batch_id) || 0,
      locationId:
        row.location_id == null || row.location_id === ""
          ? null
          : Number(row.location_id),
      locationName:
        row.location_name ||
        (row.location_id ? String(row.location_id) : "(none)"),
      name: row.batch_name ?? null,
      codeMill: row.code_mill ?? null,
      codeSartor: row.code_sartor ?? null,
      qty: Number(row.qty || 0),
    }));
  }, [filteredBatches]);
  // console.log("!! filtered stockByBatch", filteredBatches);
  // Inventory modal state
  const [amendBatchOpen, setAmendBatchOpen] = useState(false);
  const [amendProductOpen, setAmendProductOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState<any | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [batchEdit, setBatchEdit] = useState<{
    batchId: number;
    name?: string | null;
    codeMill?: string | null;
    codeSartor?: string | null;
  } | null>(null);
  const batchEditForm = useForm<{
    name: string;
    codeMill: string;
    codeSartor: string;
  }>({
    defaultValues: {
      name: "",
      codeMill: "",
      codeSartor: "",
    },
  });
  const batchEditFetcher = useFetcher<{
    ok?: boolean;
    error?: string;
    intent?: string;
  }>();
  const [batchEditSubmissionId, setBatchEditSubmissionId] = useState<
    number | null
  >(null);
  const [batchEditError, setBatchEditError] = useState<string | null>(null);
  const closeBatchEdit = useCallback(() => {
    setBatchEdit(null);
    batchEditForm.reset({ name: "", codeMill: "", codeSartor: "" });
    setBatchEditError(null);
    setBatchEditSubmissionId(null);
  }, [batchEditForm]);
  useEffect(() => {
    if (!batchEdit) return;
    batchEditForm.reset({
      name: batchEdit.name || "",
      codeMill: batchEdit.codeMill || "",
      codeSartor: batchEdit.codeSartor || "",
    });
    setBatchEditError(null);
  }, [batchEdit, batchEditForm]);
  useEffect(() => {
    if (batchEditSubmissionId == null) return;
    if (batchEditFetcher.state !== "idle") return;
    const data = batchEditFetcher.data;
    if (data?.ok) {
      closeBatchEdit();
      revalidate();
    } else if (data?.intent === "batch.editMeta") {
      setBatchEditError(data.error || "Unable to update batch.");
    }
    setBatchEditSubmissionId(null);
  }, [
    batchEditSubmissionId,
    batchEditFetcher.state,
    batchEditFetcher.data,
    closeBatchEdit,
    revalidate,
  ]);
  useEffect(() => {
    closeBatchEdit();
  }, [product.id, closeBatchEdit]);
  const filtered = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    let arr = productChoices as any[];
    if (q)
      arr = arr.filter((p) =>
        ((p.sku || "") + " " + (p.name || "")).toLowerCase().includes(q)
      );
    if (assemblyItemOnly)
      arr = arr.filter((p) => (p._count?.productLines ?? 0) === 0);
    return arr;
  }, [productChoices, pickerSearch, assemblyItemOnly]);
  const handleBatchEditSubmit = batchEditForm.handleSubmit((values) => {
    if (!batchEdit) return;
    const fd = new FormData();
    fd.set("_intent", "batch.editMeta");
    fd.set("batchId", String(batchEdit.batchId));
    fd.set("name", values.name ?? "");
    fd.set("codeMill", values.codeMill ?? "");
    fd.set("codeSartor", values.codeSartor ?? "");
    setBatchEditError(null);
    setBatchEditSubmissionId(Date.now());
    batchEditFetcher.submit(fd, { method: "post" });
  });
  const batchEditBusy = batchEditFetcher.state !== "idle";

  // Normalize arrays/records for safe rendering across loader branches
  const lines = useMemo(
    () => ((movements as any[]) || []).filter(Boolean),
    [movements]
  );
  const deletePhrase = PRODUCT_DELETE_PHRASE;
  const normalizedDeleteInput = deleteConfirmation
    .replace(/\u2019/g, "'")
    .trim();
  const deleteReady = normalizedDeleteInput === deletePhrase;
  const deleteActionResult =
    actionData &&
    typeof actionData === "object" &&
    (actionData as any).intent === "delete"
      ? (actionData as { intent: string; error?: string })
      : null;
  const deleteError = deleteActionResult?.error;
  const headers = useMemo(
    () => ((movementHeaders as any[]) || []).filter(Boolean),
    [movementHeaders]
  );
  const locById = useMemo(
    () => (locationNameById as any as Record<number | string, string>) || {},
    [locationNameById]
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        {(() => {
          const appendHref = useFindHrefAppender();
          const saved = getSavedIndexSearch("/products");
          const hrefProducts = saved
            ? `/products${saved}`
            : appendHref("/products");
          return (
            <BreadcrumbSet
              breadcrumbs={[
                { label: "Products", href: hrefProducts },
                {
                  label: String(product.id),
                  href: appendHref(`/products/${product.id}`),
                },
              ]}
            />
          );
        })()}
        <Group
          gap="xs"
          style={{ minWidth: 280, maxWidth: 520, flex: 1 }}
          justify="flex-end"
        >
          <div style={{ minWidth: 280, maxWidth: 520, width: "100%" }}>
            <Controller
              control={editForm.control as any}
              name={"tagNames" as any}
              render={({ field }) => (
                <TagsInput
                  placeholder="Add tags"
                  value={field.value || []}
                  onChange={(vals) => field.onChange(vals)}
                  clearable
                />
              )}
            />
          </div>
        </Group>
      </Group>
      <ProductFindManager />
      <Form id="product-form" method="post">
        {/* Isolate global form init into a dedicated child to reduce HMR churn */}
        <GlobalFormInit form={editForm as any} onSave={saveUpdate} />
        <ProductDetailForm
          mode={"edit" as any}
          form={editForm as any}
          product={product}
        />
      </Form>
      {/* Tags block removed; now handled by TagsInput in header and saved via global form */}
      {/* Bill of Materials (Finished products only) */}
      {product.type === "Finished" && (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Group justify="space-between" align="center">
              <Group gap="sm" align="center">
                <Title order={4}>Bill of Materials</Title>
                <Button
                  size="xs"
                  variant="light"
                  component={Link}
                  to={`/products/${product.id}/bom-fullzoom`}
                >
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
                    <Table.Td>
                      {pl.child ? (
                        <Link to={`/products/${pl.child.id}`}>
                          {pl.child.name || pl.child.id}
                        </Link>
                      ) : (
                        pl.childId
                      )}
                    </Table.Td>
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
      )}

      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack>
            {/* Stock by Location + Batch (left) */}
            <Card withBorder padding="md" bg="transparent">
              <Card.Section>
                <Table highlightOnHover>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>Total Stock</Table.Td>
                      <Table.Td>
                        <Title order={1}>
                          {Number(
                            (stockByLocation as any[])
                              .reduce((sum, r) => sum + Number(r.qty || 0), 0)
                              .toFixed(2)
                          )}
                        </Title>
                      </Table.Td>
                    </Table.Tr>
                    {(stockByLocation || []).map((row: any, i: number) => (
                      // Use composite key with index to avoid collisions when location_id is null/duplicate
                      <Table.Tr key={`loc-${row.location_id ?? "none"}-${i}`}>
                        <Table.Td>
                          {row.location_name ||
                            `${row.location_id ?? "(none)"}`}
                        </Table.Td>
                        <Table.Td>{Number(row.qty ?? 0)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card.Section>
            </Card>
            {/* Stock by Batch */}
            <Card withBorder padding="md" bg="transparent">
              <Card.Section inheritPadding py="xs">
                <Group justify="space-between" align="center" px={8} pb={6}>
                  <Title order={5}>Stock by Batch</Title>
                  <Group gap="sm" wrap="wrap">
                    <SegmentedControl
                      size="xs"
                      data={[
                        { label: "Current", value: "current" },
                        { label: "All", value: "all" },
                      ]}
                      value={batchScope}
                      onChange={(v) => setBatchScope(v as any)}
                    />
                    <Select
                      size="xs"
                      data={batchLocationOptions}
                      value={batchLocation}
                      onChange={(v) => setBatchLocation(v || "all")}
                      searchable
                      clearable={false}
                      w={200}
                    />
                    <Button
                      size="xs"
                      variant="light"
                      onClick={() => {
                        const rows: BatchRowLite[] = filteredBatchRowsLite.map(
                          (r) => ({ ...r })
                        );
                        setActiveBatch({ rows });
                        setAmendProductOpen(true);
                      }}
                    >
                      Amend All…
                    </Button>
                  </Group>
                </Group>
              </Card.Section>
              <Card.Section>
                <Table
                  // striped
                  // withTableBorder
                  withColumnBorders
                  highlightOnHover
                >
                  <Table.Thead fs="xs">
                    <Table.Tr>
                      <Table.Th>Codes</Table.Th>
                      <Table.Th>Location</Table.Th>
                      <Table.Th>Received</Table.Th>
                      <Table.Th>Qty</Table.Th>
                      <Table.Th></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredBatches.map((row: any) => (
                      // Batch id alone can repeat across locations; include location in key to ensure uniqueness
                      <Table.Tr
                        key={`batch-${row.batch_id}-${
                          row.location_id ?? "none"
                        }`}
                      >
                        <Table.Td>
                          {row.code_mill || row.code_sartor ? (
                            <>
                              {row.code_mill || ""}
                              {row.code_sartor
                                ? (row.code_mill ? " | " : "") + row.code_sartor
                                : ""}
                            </>
                          ) : (
                            `${row.batch_id}`
                          )}
                        </Table.Td>

                        <Table.Td>
                          {row.location_name ||
                            (row.location_id ? `${row.location_id}` : "")}
                        </Table.Td>
                        <Table.Td>
                          {row.received_at
                            ? new Date(row.received_at).toLocaleDateString()
                            : ""}
                        </Table.Td>
                        <Table.Td>{Number(row.qty ?? 0)}</Table.Td>
                        <Table.Td>
                          <Menu withinPortal position="bottom-end" shadow="md">
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                size="sm"
                                aria-label="Batch actions"
                              >
                                <IconMenu2 size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item
                                disabled={row.batch_id == null}
                                onClick={() => {
                                  if (row.batch_id == null) return;
                                  setBatchEdit({
                                    batchId: Number(row.batch_id),
                                    name: row.batch_name ?? "",
                                    codeMill: row.code_mill ?? "",
                                    codeSartor: row.code_sartor ?? "",
                                  });
                                }}
                              >
                                Edit details
                              </Menu.Item>
                              <Menu.Item
                                onClick={() => {
                                  setActiveBatch(row);
                                  setAmendBatchOpen(true);
                                }}
                              >
                                Amend
                              </Menu.Item>
                              <Menu.Item
                                onClick={() => {
                                  setActiveBatch(row);
                                  setTransferOpen(true);
                                }}
                              >
                                Transfer
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Card.Section>
            </Card>
            {/* Modals */}
            <Modal
              opened={deleteModalOpen}
              onClose={() => {
                setDeleteModalOpen(false);
                setDeleteConfirmation("");
              }}
              title="Delete Product"
              centered
            >
              <Form method="post">
                <Stack gap="sm">
                  <input type="hidden" name="_intent" value="delete" />
                  <Text size="sm" c="dimmed">
                    This action cannot be undone. Type the confirmation phrase
                    to proceed.
                  </Text>
                  <TextInput
                    name="confirmDelete"
                    label={`Type ${deletePhrase}`}
                    placeholder={deletePhrase}
                    value={deleteConfirmation}
                    onChange={(e) =>
                      setDeleteConfirmation(e.currentTarget.value)
                    }
                    autoComplete="off"
                  />
                  {deleteError ? (
                    <Text size="sm" c="red">
                      {deleteError}
                    </Text>
                  ) : null}
                  <Group justify="flex-end" gap="sm">
                    <Button
                      variant="default"
                      type="button"
                      onClick={() => {
                        setDeleteModalOpen(false);
                        setDeleteConfirmation("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      color="red"
                      type="submit"
                      disabled={!deleteReady || busy}
                      loading={busy}
                    >
                      Delete
                    </Button>
                  </Group>
                </Stack>
              </Form>
            </Modal>
            <Modal
              opened={!!batchEdit}
              onClose={closeBatchEdit}
              title="Edit Batch Details"
              centered
              size="sm"
            >
              {batchEdit ? (
                <form onSubmit={handleBatchEditSubmit}>
                  <Stack gap="sm">
                    <TextInput
                      label="Batch name"
                      placeholder="Optional display name"
                      {...batchEditForm.register("name")}
                    />
                    <TextInput
                      label="Mill code"
                      placeholder="Enter mill code"
                      {...batchEditForm.register("codeMill")}
                    />
                    <TextInput
                      label="Sartor code"
                      placeholder="Enter Sartor code"
                      {...batchEditForm.register("codeSartor")}
                    />
                    {batchEditError ? (
                      <Text size="sm" c="red">
                        {batchEditError}
                      </Text>
                    ) : null}
                    <Group justify="flex-end" gap="sm">
                      <Button
                        variant="default"
                        type="button"
                        onClick={closeBatchEdit}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        loading={batchEditBusy}
                        disabled={batchEditBusy}
                      >
                        Save
                      </Button>
                    </Group>
                  </Stack>
                </form>
              ) : null}
            </Modal>
            <InventoryAmendmentModal
              opened={amendBatchOpen}
              onClose={() => setAmendBatchOpen(false)}
              productId={product.id}
              mode="batch"
              batch={
                activeBatch
                  ? {
                      batchId: activeBatch.batch_id,
                      locationId: activeBatch.location_id,
                      locationName: activeBatch.location_name,
                      name: activeBatch.batch_name,
                      codeMill: activeBatch.code_mill,
                      codeSartor: activeBatch.code_sartor,
                      qty: Number(activeBatch.qty || 0),
                    }
                  : null
              }
            />
            <InventoryAmendmentModal
              opened={amendProductOpen}
              onClose={() => setAmendProductOpen(false)}
              productId={product.id}
              mode="product"
              batches={(activeBatch?.rows || []) as any}
            />
            <InventoryTransferModal
              opened={transferOpen}
              onClose={() => setTransferOpen(false)}
              productId={product.id}
              sourceBatchId={activeBatch?.batch_id}
              sourceLabel={
                activeBatch
                  ? activeBatch.code_mill ||
                    activeBatch.code_sartor ||
                    String(activeBatch.batch_id)
                  : ""
              }
              sourceQty={Number(activeBatch?.qty || 0)}
              sourceLocationId={activeBatch?.location_id ?? null}
              targetOptions={
                filteredBatches
                  .filter((r: any) => r.batch_id !== activeBatch?.batch_id)
                  .map((r: any) => ({
                    value: String(r.batch_id),
                    label: (r.code_mill ||
                      r.code_sartor ||
                      r.batch_name ||
                      String(r.batch_id)) as string,
                    locationId: r.location_id,
                  })) as BatchOption[]
              }
            />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          {/* Product Movements (right) */}
          <Card withBorder padding="md" bg="transparent">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={4}>Product Movements</Title>
                {/* view switch removed */}
              </Group>
            </Card.Section>
            <Card.Section>
              <Table withColumnBorders highlightOnHover>
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
                    ? (showAllMovements ? lines : lines.slice(0, 8)).map(
                        (ml: any) => (
                          <Table.Tr key={`line-${ml.id}`}>
                            <Table.Td>
                              {ml.movement?.date
                                ? new Date(
                                    ml.movement.date
                                  ).toLocaleDateString()
                                : ""}
                            </Table.Td>
                            <Table.Td>
                              {ml.movement?.movementType || ""}
                            </Table.Td>
                            <Table.Td>
                              {ml.movement?.locationOutId != null
                                ? locById?.[ml.movement.locationOutId] ||
                                  ml.movement.locationOutId
                                : ""}
                            </Table.Td>
                            <Table.Td>
                              {ml.movement?.locationInId != null
                                ? locById?.[ml.movement.locationInId] ||
                                  ml.movement.locationInId
                                : ""}
                            </Table.Td>
                            <Table.Td>
                              {ml.batch?.codeMill || ml.batch?.codeSartor
                                ? `${ml.batch?.codeMill || ""}${
                                    ml.batch?.codeMill && ml.batch?.codeSartor
                                      ? " | "
                                      : ""
                                  }${ml.batch?.codeSartor || ""}`
                                : ml.batch?.id
                                ? `${ml.batch.id}`
                                : ""}
                            </Table.Td>
                            <Table.Td>{ml.quantity ?? ""}</Table.Td>
                            <Table.Td>{ml.notes || ""}</Table.Td>
                          </Table.Tr>
                        )
                      )
                    : (showAllMovements ? headers : headers.slice(0, 8)).map(
                        (mh: any) => (
                          <Table.Tr key={`hdr-${mh.id}`}>
                            <Table.Td>
                              {mh.date
                                ? new Date(mh.date).toLocaleDateString()
                                : ""}
                            </Table.Td>
                            <Table.Td>{mh.movementType || ""}</Table.Td>
                            <Table.Td>
                              {mh.locationOutId != null
                                ? locById?.[mh.locationOutId] ||
                                  mh.locationOutId
                                : ""}
                            </Table.Td>
                            <Table.Td>
                              {mh.locationInId != null
                                ? locById?.[mh.locationInId] || mh.locationInId
                                : ""}
                            </Table.Td>
                            <Table.Td>{mh.quantity ?? ""}</Table.Td>
                            <Table.Td>{mh.notes || ""}</Table.Td>
                          </Table.Tr>
                        )
                      )}
                </Table.Tbody>
              </Table>
            </Card.Section>
            {(() => {
              const total =
                movementView === "line" ? lines.length : headers.length;
              if (total > 8 && !showAllMovements)
                return (
                  <Card.Section>
                    <Group justify="center" mt={8}>
                      <Anchor
                        component="button"
                        type="button"
                        onClick={() => setShowAllMovements(true)}
                        size="sm"
                      >
                        Show all {total} movements
                      </Anchor>
                    </Group>
                  </Card.Section>
                );
              return null;
            })()}
          </Card>
        </Grid.Col>
      </Grid>
      <ProductPickerModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add Component"
        searchValue={pickerSearch}
        onSearchChange={setPickerSearch}
        results={filtered as any}
        loading={false}
        assemblyItemOnly={assemblyItemOnly}
        onAssemblyItemOnlyChange={setAssemblyItemOnly}
        onSelect={(p) => {
          const fd = new FormData();
          fd.set("_intent", "product.addComponent");
          fd.set("childId", String(p.id));
          submit(fd, { method: "post" });
          setPickerOpen(false);
        }}
      />
      <Group justify="space-between" align="flex-start">
        <Button
          color="red"
          variant="light"
          onClick={() => {
            setDeleteConfirmation("");
            setDeleteModalOpen(true);
          }}
        >
          Delete product
        </Button>
        <refreshFetcher.Form method="post">
          <input type="hidden" name="_intent" value="stock.refresh" />
          <Button
            size="xs"
            variant="light"
            type="submit"
            loading={refreshFetcher.state !== "idle"}
          >
            Refresh Stock View
          </Button>
        </refreshFetcher.Form>
      </Group>
    </Stack>
  );
}
