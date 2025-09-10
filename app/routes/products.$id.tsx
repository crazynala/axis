import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, Form, useNavigation, useSubmit, useActionData } from "@remix-run/react";
import { Stack, Title, Group, Text, Button, Card, Divider, Table, SimpleGrid, Badge, SegmentedControl, Grid } from "@mantine/core";
import { TextInput, Checkbox, NumberInput, Modal, Switch } from "@mantine/core";
import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { BreadcrumbSet, useMasterTable, useRecordBrowser, RecordNavButtons, useRecordBrowserShortcuts, useInitGlobalFormContext } from "@aa/timber";
import { FindProvider, useFind } from "../find/FindContext";

// Read Find mode inside the provider via a tiny render-prop helper
function ModeScope({ children }: { children: (mode: "edit" | "find") => React.ReactNode }) {
  const { mode } = useFind();
  return <>{children(mode)}</>;
}

// Auto-exit find mode after a search post completes and a product id is present
function FindModeAutoExit({ nav, productId }: { nav: ReturnType<typeof useNavigation>; productId: number }) {
  const { mode, setMode } = useFind();
  const wasSubmitting = useRef(false);
  useEffect(() => {
    const submitting = nav.state !== "idle";
    if (mode === "find") {
      if (!wasSubmitting.current && submitting) {
        wasSubmitting.current = true; // search started
      }
      if (wasSubmitting.current && !submitting) {
        // A navigation completed while in find mode; exit to edit
        setMode("edit");
        wasSubmitting.current = false;
      }
    } else if (!submitting) {
      wasSubmitting.current = false;
    }
  }, [nav.state, mode, setMode, productId]);
  return null;
}
import { FindToggle } from "../find/FindToggle";
import { TriBool, NumberMaybeRange, TextAny } from "../find/FindWidgets";
import { TaxCodeSelect, type TaxCodeOption } from "../components/TaxCodeSelect";
import { CompanySelect, type CompanyOption } from "../components/CompanySelect";
import { CategorySelect, type CategoryOption } from "../components/CategorySelect";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.product ? `Product ${data.product.name ?? data.product.id}` : "Product",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const idStr = params.id;
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) {
    throw new Response("Invalid product id", { status: 400 });
  }
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      purchaseTax: { select: { id: true, label: true } },
      category: { select: { id: true, label: true } },
      variantSet: { select: { id: true, name: true, variants: true } },
      batches: true,
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
    },
  });
  if (!product) throw new Response("Not found", { status: 404 });
  const taxCodes = await prisma.valueList.findMany({
    where: { type: "Tax" },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
  const categories = await prisma.valueList.findMany({
    where: { type: "Category" },
    orderBy: { label: "asc" },
    select: { id: true, label: true },
  });
  const companies = await prisma.company.findMany({
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
  const productChoices = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      _count: { select: { productLines: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
  });
  const movements = await prisma.productMovementLine.findMany({
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
      batch: {
        select: { id: true, codeMill: true, codeSartor: true },
      },
    },
    orderBy: [{ movement: { date: "desc" } }, { id: "desc" }],
    take: 500,
  });
  const movementHeaders = await prisma.productMovement.findMany({
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
    ? await prisma.location.findMany({
        where: { id: { in: locIds } },
        select: { id: true, name: true },
      })
    : [];
  const locationNameById = Object.fromEntries(locs.map((l) => [l.id, l.name ?? String(l.id)]));
  return json({
    product,
    stockByLocation: (product as any).c_byLocation,
    stockByBatch: (product as any).c_byBatch,
    productChoices,
    movements,
    movementHeaders,
    locationNameById,
    taxCodeOptions: taxCodes.map((t) => ({
      value: t.id,
      label: t.label || String(t.id),
    })),
    categoryOptions: categories.map((c) => ({
      value: c.id,
      label: c.label || String(c.id),
    })),
    companyOptions: companies.map((c) => ({
      value: c.id,
      label: c.name || String(c.id),
      isCustomer: !!c.isCustomer,
      isSupplier: !!c.isSupplier,
      isCarrier: !!c.isCarrier,
    })),
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "find") {
    const raw = Object.fromEntries(form.entries());
    const values: any = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k.startsWith("_")) continue;
      values[k] = v === "" ? null : v;
    }
    const { productSearchSchema } = await import("../find/product.search-schema");
    const { buildWhere } = await import("../find/buildWhere");
    const where = buildWhere(values, productSearchSchema);
    const first = await prisma.product.findFirst({
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
    const data: any = {};
    const str = (k: string) => {
      if (form.has(k)) data[k] = (form.get(k) as string) || null;
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
    // accept sku/type as strings
    str("sku");
    str("name");
    str("description");
    str("type");
    num("costPrice");
    num("manualSalePrice");
    num("purchaseTaxId");
    num("categoryId");
    num("customerId");
    num("supplierId");
    bool("stockTrackingEnabled");
    bool("batchTrackingEnabled");
    await prisma.product.update({ where: { id }, data });
    return redirect(`/products/${id}`);
  }
  if (intent === "product.addComponent") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    const childId = Number(form.get("childId"));
    if (Number.isFinite(childId)) {
      await prisma.productLine.create({
        data: { parentId: id, childId, quantity: 1 },
      });
    }
    return redirect(`/products/${id}`);
  }
  if (intent === "delete") {
    if (!Number.isFinite(id)) return json({ error: "Invalid product id" }, { status: 400 });
    await prisma.product.delete({ where: { id } });
    return redirect("/products");
  }
  return redirect(`/products/${id}`);
}

export default function ProductDetailRoute() {
  const { product, stockByLocation, stockByBatch, productChoices, movements, movementHeaders, locationNameById, taxCodeOptions, categoryOptions, companyOptions } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // Register local keyboard shortcuts for navigating records
  useRecordBrowserShortcuts(product.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();

  type ProductFormValues = {
    id?: number | string | null;
    sku: string | null;
    name: string;
    description: string;
    type: string | null;
    costPrice?: number | null;
    manualSalePrice?: number | null;
    purchaseTaxId?: number | null;
    categoryId?: number | null;
    customerId?: number | null;
    supplierId?: number | null;
    stockTrackingEnabled?: boolean;
    batchTrackingEnabled?: boolean;
    // search-only
    costPriceMin?: number | null;
    costPriceMax?: number | null;
    manualSalePriceMin?: number | null;
    manualSalePriceMax?: number | null;
    componentChildSku?: string | null;
    componentChildName?: string | null;
    componentChildSupplierId?: number | null;
    componentChildType?: string | null;
  };

  // Helpers to build RHF default values for each mode
  const buildEditDefaults = (p: any): ProductFormValues => ({
    id: p.id,
    sku: p.sku || "",
    name: p.name || "",
    description: p.description || "",
    type: p.type || "",
    costPrice: p.costPrice ?? undefined,
    manualSalePrice: p.manualSalePrice ?? undefined,
    purchaseTaxId: p.purchaseTaxId ?? p.purchaseTax?.id ?? undefined,
    categoryId: p.categoryId ?? p.category?.id ?? undefined,
    customerId: p.customerId ?? p.customer?.id ?? null,
    supplierId: p.supplierId ?? p.supplier?.id ?? null,
    stockTrackingEnabled: !!p.stockTrackingEnabled,
    batchTrackingEnabled: !!p.batchTrackingEnabled,
  });
  const buildFindDefaults = (_p: any): ProductFormValues => ({
    id: undefined,
    sku: "",
    name: "",
    description: "",
    type: "",
    costPrice: undefined,
    manualSalePrice: undefined,
    purchaseTaxId: undefined,
    categoryId: undefined,
    customerId: undefined,
    supplierId: undefined,
    stockTrackingEnabled: undefined,
    batchTrackingEnabled: undefined,
    costPriceMin: undefined,
    costPriceMax: undefined,
    manualSalePriceMin: undefined,
    manualSalePriceMax: undefined,
    componentChildSku: undefined,
    componentChildName: undefined,
    componentChildSupplierId: undefined,
    componentChildType: undefined,
  });

  // Real edit form (bound to header Save/Cancel)
  const editForm = useForm<ProductFormValues>({ defaultValues: buildEditDefaults(product) });

  // Blank find form (not bound to header Save/Cancel)
  const findForm = useForm<ProductFormValues>({ defaultValues: buildFindDefaults(product) });

  // Reset forms when navigating across records
  useEffect(() => {
    editForm.reset(buildEditDefaults(product));
  }, [product.id]);

  // activeForm is computed inside ModeScope (within provider)

  // Only wire header Save/Cancel to the real edit form
  const saveUpdate = useCallback(
    (values: ProductFormValues) => {
      const fd = new FormData();
      fd.set("_intent", "update");
      if (values.sku != null) fd.set("sku", values.sku);
      if (values.name) fd.set("name", values.name);
      if (values.description) fd.set("description", values.description);
      if (values.type) fd.set("type", values.type);
      if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
      if (values.manualSalePrice != null) fd.set("manualSalePrice", String(values.manualSalePrice));
      if (values.purchaseTaxId != null) fd.set("purchaseTaxId", String(values.purchaseTaxId));
      if (values.categoryId != null) fd.set("categoryId", String(values.categoryId));
      if (values.customerId != null) fd.set("customerId", String(values.customerId));
      if (values.supplierId != null) fd.set("supplierId", String(values.supplierId));
      fd.set("stockTrackingEnabled", values.stockTrackingEnabled ? "true" : "false");
      fd.set("batchTrackingEnabled", values.batchTrackingEnabled ? "true" : "false");
      submit(fd, { method: "post" });
    },
    [submit]
  );

  useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

  // Prevent entering find mode if edit form has unsaved changes
  const beforeEnterFind = useCallback(() => {
    if (editForm.formState.isDirty) {
      window.alert("Save or discard changes before entering Find mode.");
      return false;
    }
    // ensure blank criteria each time
    findForm.reset();
    return true;
  }, [editForm.formState.isDirty, findForm]);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
  // Movements view: header-level ProductMovement vs line-level ProductMovementLine
  const [movementView, setMovementView] = useState<"header" | "line">("line");
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
  // read mode only within provider (via ModeScope)

  return (
    <FindProvider>
      <FindModeAutoExit nav={nav} productId={product.id} />
      <ModeScope>
        {(mode) => {
          const activeForm = mode === "find" ? findForm : editForm;
          return (
            <Stack gap="lg">
              <Group justify="space-between" align="center">
                <BreadcrumbSet
                  breadcrumbs={[
                    { label: "Products", href: "/products" },
                    { label: String(product.id), href: `/products/${product.id}` },
                  ]}
                />
                <Group>
                  <FindToggle
                    beforeEnterFind={beforeEnterFind}
                    onSearch={() => {
                      const v = findForm.getValues();
                      const fd = new FormData();
                      fd.set("_intent", "find");
                      const put = (k: string, val: any) => {
                        if (val === undefined || val === null || val === "") return;
                        fd.set(k, String(val));
                      };
                      put("id", v.id);
                      put("sku", v.sku);
                      put("name", v.name);
                      put("description", v.description);
                      put("type", v.type);
                      put("costPriceMin", v.costPriceMin);
                      put("costPriceMax", v.costPriceMax);
                      put("manualSalePriceMin", v.manualSalePriceMin);
                      put("manualSalePriceMax", v.manualSalePriceMax);
                      put("purchaseTaxId", v.purchaseTaxId);
                      put("categoryId", v.categoryId);
                      put("customerId", v.customerId);
                      put("supplierId", v.supplierId);
                      if (v.stockTrackingEnabled === true) fd.set("stockTrackingEnabled", "true");
                      if (v.stockTrackingEnabled === false) fd.set("stockTrackingEnabled", "false");
                      if (v.batchTrackingEnabled === true) fd.set("batchTrackingEnabled", "true");
                      if (v.batchTrackingEnabled === false) fd.set("batchTrackingEnabled", "false");
                      put("componentChildSku", v.componentChildSku);
                      put("componentChildName", v.componentChildName);
                      put("componentChildSupplierId", v.componentChildSupplierId);
                      put("componentChildType", v.componentChildType);
                      submit(fd, { method: "post" });
                    }}
                  />
                  <RecordNavButtons recordBrowser={useRecordBrowser(product.id, masterRecords)} />
                </Group>
              </Group>

              {/* Force remount of inputs on mode change to isolate Controllers */}
              <div key={`mode-${mode}`}>
                <Form id="product-form" method="post">
                  <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                    <Card withBorder padding="md">
                      <Stack gap={6}>
                        {mode === "find" ? (
                          <TextAny label="ID" mod="data-autoSize" placeholder="equals…" {...activeForm.register("id")} />
                        ) : (
                          <TextInput label="ID" mod="data-autoSize" readOnly value={String(product.id)} />
                        )}
                        <TextAny label="SKU" mod="data-autoSize" {...activeForm.register("sku")} />
                        <TextAny label="Name" mod="data-autoSize" {...activeForm.register("name")} />
                        <TextAny label="Description" mod="data-autoSize" {...activeForm.register("description")} />
                        <TextAny label="Type" mod="data-autoSize" {...activeForm.register("type")} />
                      </Stack>
                    </Card>
                    <Card withBorder padding="md">
                      <Card.Section inheritPadding py="xs">
                        <Title order={4}>Relations</Title>
                      </Card.Section>
                      <Divider my="xs" />
                      <Stack gap={6}>
                        <Controller
                          name="customerId"
                          control={activeForm.control}
                          render={({ field }) => (
                            <CompanySelect label="Customer" value={field.value as any} onChange={(v) => field.onChange(v)} options={companyOptions as unknown as CompanyOption[]} filter="customer" />
                          )}
                        />
                        <TextInput
                          label="Variant Set"
                          mod="data-autoSize"
                          readOnly
                          value={product.variantSet?.name || (product.variantSet?.variants?.length ? `${product.variantSet?.variants.length} variants` : "")}
                        />
                        <Controller
                          name="stockTrackingEnabled"
                          control={activeForm.control}
                          render={({ field }) => <TriBool label="Stock Tracking" value={(field.value ?? "any") as any} onChange={(v) => field.onChange(v === "any" ? undefined : v)} />}
                        />
                        <Controller
                          name="batchTrackingEnabled"
                          control={activeForm.control}
                          render={({ field }) => <TriBool label="Batch Tracking" value={(field.value ?? "any") as any} onChange={(v) => field.onChange(v === "any" ? undefined : v)} />}
                        />
                      </Stack>
                    </Card>
                    <Card withBorder padding="md">
                      <Card.Section inheritPadding py="xs">
                        <Title order={4}>Commercial</Title>
                      </Card.Section>
                      <Divider my="xs" />
                      <Stack gap={6}>
                        <NumberMaybeRange
                          label="Cost Price"
                          value={activeForm.getValues("costPrice")}
                          onChange={(v) => activeForm.setValue("costPrice", v as any)}
                          minValue={activeForm.getValues("costPriceMin")}
                          maxValue={activeForm.getValues("costPriceMax")}
                          onMinChange={(v) => activeForm.setValue("costPriceMin", v as any)}
                          onMaxChange={(v) => activeForm.setValue("costPriceMax", v as any)}
                        />
                        <NumberMaybeRange
                          label="Manual Sale Price"
                          value={activeForm.getValues("manualSalePrice")}
                          onChange={(v) => activeForm.setValue("manualSalePrice", v as any)}
                          minValue={activeForm.getValues("manualSalePriceMin")}
                          maxValue={activeForm.getValues("manualSalePriceMax")}
                          onMinChange={(v) => activeForm.setValue("manualSalePriceMin", v as any)}
                          onMaxChange={(v) => activeForm.setValue("manualSalePriceMax", v as any)}
                        />
                        <Controller
                          name="purchaseTaxId"
                          control={activeForm.control}
                          render={({ field }) => (
                            <TaxCodeSelect label="Purchase Tax" value={field.value as any} onChange={(v) => field.onChange(v)} options={taxCodeOptions as unknown as TaxCodeOption[]} />
                          )}
                        />
                        <Controller
                          name="categoryId"
                          control={activeForm.control}
                          render={({ field }) => (
                            <CategorySelect label="Category" value={field.value as any} onChange={(v) => field.onChange(v)} options={categoryOptions as unknown as CategoryOption[]} />
                          )}
                        />
                        <Controller
                          name="supplierId"
                          control={activeForm.control}
                          render={({ field }) => (
                            <CompanySelect label="Supplier" value={field.value as any} onChange={(v) => field.onChange(v)} options={companyOptions as unknown as CompanyOption[]} filter="supplier" />
                          )}
                        />
                      </Stack>
                    </Card>
                  </SimpleGrid>
                </Form>

                {/* Find-only criteria row */}
                {mode === "find" && (
                  <Card withBorder padding="md">
                    <Table withTableBorder withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Child SKU</Table.Th>
                          <Table.Th>Child Name</Table.Th>
                          <Table.Th>Child Type</Table.Th>
                          <Table.Th>Child Supplier</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td>
                            <TextAny placeholder="contains…" {...findForm.register("componentChildSku")} />
                          </Table.Td>
                          <Table.Td>
                            <TextAny placeholder="contains…" {...findForm.register("componentChildName")} />
                          </Table.Td>
                          <Table.Td>
                            <TextAny placeholder="contains…" {...findForm.register("componentChildType")} />
                          </Table.Td>
                          <Table.Td>
                            <Controller
                              name="componentChildSupplierId"
                              control={findForm.control}
                              render={({ field }) => <CompanySelect label="" value={field.value as any} onChange={(v) => field.onChange(v)} options={companyOptions as any} filter="supplier" />}
                            />
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </Card>
                )}
              </div>

              {/* Bill of Materials */}
              {mode === "edit" && (
                <Card withBorder padding="md">
                  <Card.Section inheritPadding py="xs">
                    <Group justify="space-between" align="center">
                      <Title order={4}>Bill of Materials</Title>
                      <Button variant="light" onClick={() => setPickerOpen(true)}>
                        Add Component
                      </Button>
                    </Group>
                  </Card.Section>
                  {/* <Divider my="xs" /> */}
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
              )}

              {mode === "find" && (
                <Card withBorder padding="md">
                  <Card.Section inheritPadding py="xs">
                    <Title order={4}>Bill of Materials — Find Criteria</Title>
                  </Card.Section>
                  <Table withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Child SKU</Table.Th>
                        <Table.Th>Child Name</Table.Th>
                        <Table.Th>Child Type</Table.Th>
                        <Table.Th>Child Supplier</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      <Table.Tr>
                        <Table.Td>
                          <TextAny placeholder="contains…" {...findForm.register("componentChildSku")} />
                        </Table.Td>
                        <Table.Td>
                          <TextAny placeholder="contains…" {...findForm.register("componentChildName")} />
                        </Table.Td>
                        <Table.Td>
                          <TextAny placeholder="contains…" {...findForm.register("componentChildType")} />
                        </Table.Td>
                        <Table.Td>
                          <Controller
                            name="componentChildSupplierId"
                            control={findForm.control}
                            render={({ field }) => <CompanySelect label="" value={field.value as any} onChange={(v) => field.onChange(v)} options={companyOptions as any} filter="supplier" />}
                          />
                        </Table.Td>
                      </Table.Tr>
                    </Table.Tbody>
                  </Table>
                </Card>
              )}

              {/* Stock + Movements */}
              {mode === "edit" && (
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
                          <Group justify="space-between" align="center">
                            <Title order={4}>Stock by Location</Title>
                            <Badge variant="light">Global: {Number((product as any).stockQty ?? 0)}</Badge>
                          </Group>
                        </Card.Section>
                        <Divider my="md" />
                        <Group justify="space-between" align="center" px={8} pb={6}>
                          <Title order={5}>Stock by Batch</Title>
                          <Group gap="sm" wrap="wrap">
                            <SegmentedControl
                              value={batchScope}
                              onChange={(v) => setBatchScope(v as any)}
                              data={[
                                { value: "all", label: "All" },
                                { value: "current", label: "Current" },
                              ]}
                            />
                            <SegmentedControl value={batchLocation} onChange={(v) => setBatchLocation(v)} data={batchLocationOptions} />
                          </Group>
                        </Group>
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
                          <SegmentedControl
                            value={movementView}
                            onChange={(v) => setMovementView(v as any)}
                            data={[
                              { value: "header", label: "Movement" },
                              { value: "line", label: "Line" },
                            ]}
                          />
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
                            ? (movements || []).map((ml) => (
                                <Table.Tr key={`line-${ml.id}`}>
                                  <Table.Td>{ml.movement?.date ? new Date(ml.movement.date).toLocaleDateString() : ""}</Table.Td>
                                  <Table.Td>{ml.movement?.movementType || ""}</Table.Td>
                                  <Table.Td>{ml.movement?.locationOutId != null ? locationNameById?.[ml.movement.locationOutId] || ml.movement.locationOutId : ""}</Table.Td>
                                  <Table.Td>{ml.movement?.locationInId != null ? locationNameById?.[ml.movement.locationInId] || ml.movement.locationInId : ""}</Table.Td>
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
                            : (movementHeaders || []).map((mh) => (
                                <Table.Tr key={`hdr-${mh.id}`}>
                                  <Table.Td>{mh.date ? new Date(mh.date).toLocaleDateString() : ""}</Table.Td>
                                  <Table.Td>{mh.movementType || ""}</Table.Td>
                                  <Table.Td>{mh.locationOutId != null ? locationNameById?.[mh.locationOutId] || mh.locationOutId : ""}</Table.Td>
                                  <Table.Td>{mh.locationInId != null ? locationNameById?.[mh.locationInId] || mh.locationInId : ""}</Table.Td>
                                  <Table.Td>{mh.quantity ?? ""}</Table.Td>
                                  <Table.Td>{mh.notes || ""}</Table.Td>
                                </Table.Tr>
                              ))}
                        </Table.Tbody>
                      </Table>
                    </Card>
                  </Grid.Col>
                </Grid>
              )}

              {/* Add Component Picker */}
              <Modal opened={pickerOpen} onClose={() => setPickerOpen(false)} title="Add Component" size="xl" centered>
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
              </Modal>

              <Form method="post">
                <input type="hidden" name="_intent" value="delete" />
                <Button color="red" variant="light" type="submit" disabled={busy}>
                  {busy ? "Deleting..." : "Delete product"}
                </Button>
              </Form>
            </Stack>
          );
        }}
      </ModeScope>
    </FindProvider>
  );
}
