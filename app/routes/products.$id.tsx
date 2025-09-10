import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  useLoaderData,
  Link,
  Form,
  useNavigation,
  useSubmit,
  useActionData,
} from "@remix-run/react";
import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Divider,
  Flex,
  Grid,
  Group,
  Image,
  NumberInput,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
  Modal,
  SegmentedControl,
  Select,
} from "@mantine/core";
import { useProductFindify } from "../find/productFindify";
import { useCallback, useMemo, useState } from "react";
import { Controller } from "react-hook-form";
import {
  useInitGlobalFormContext,
  useMasterTable,
  BreadcrumbSet,
  useRecordBrowser,
  RecordNavButtons,
  useRecordBrowserShortcuts,
} from "@aa/timber";

import { FindToggle } from "../find/FindToggle"; // will adapt usage inline without provider
// Replaced custom widgets with config-driven system
import { renderField } from "../formConfigs/fieldConfigShared";
import {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
  productBomFindFields,
} from "../formConfigs/productDetail";
import { buildWhereFromConfig } from "../utils/buildWhereFromConfig.server";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.product
      ? `Product ${data.product.name ?? data.product.id}`
      : "Product",
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
  const locationNameById = Object.fromEntries(
    locs.map((l) => [l.id, l.name ?? String(l.id)])
  );
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
    // Build where via config arrays
    const where = buildWhereFromConfig(values, [
      ...productIdentityFields,
      ...productAssocFields,
      ...productPricingFields,
      ...productBomFindFields,
    ]);
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
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    const childId = Number(form.get("childId"));
    if (Number.isFinite(childId)) {
      await prisma.productLine.create({
        data: { parentId: id, childId, quantity: 1 },
      });
    }
    return redirect(`/products/${id}`);
  }
  if (intent === "delete") {
    if (!Number.isFinite(id))
      return json({ error: "Invalid product id" }, { status: 400 });
    await prisma.product.delete({ where: { id } });
    return redirect("/products");
  }
  return redirect(`/products/${id}`);
}

export default function ProductDetailRoute() {
  const {
    product,
    stockByLocation,
    stockByBatch,
    productChoices,
    movements,
    movementHeaders,
    locationNameById,
    taxCodeOptions,
    categoryOptions,
    companyOptions,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // Register local keyboard shortcuts for navigating records
  useRecordBrowserShortcuts(product.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();

  // Findify hook (forms, mode, style, helpers) – pass nav for auto-exit
  const {
    editForm,
    findForm,
    activeForm,
    mode,
    toggleFind,
    buildUpdatePayload,
    buildFindPayload,
  } = useProductFindify(product, nav);

  // Only wire header Save/Cancel to the real edit form
  const saveUpdate = useCallback(
    (values: any) => {
      submit(buildUpdatePayload(values), { method: "post" });
    },
    [buildUpdatePayload, submit]
  );
  useInitGlobalFormContext(editForm as any, saveUpdate, () => editForm.reset());

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
      const name =
        row.location_name ||
        (row.location_id ? `#${row.location_id}` : "(none)");
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
          <Button
            variant={mode === "find" ? "filled" : "light"}
            onClick={toggleFind}
          >
            {mode === "find" ? "Exit Find" : "Find"}
          </Button>
          {mode === "find" && (
            <Button
              variant="light"
              onClick={() =>
                submit(buildFindPayload(findForm.getValues()), {
                  method: "post",
                })
              }
            >
              Search
            </Button>
          )}
          <RecordNavButtons
            recordBrowser={useRecordBrowser(product.id, masterRecords)}
          />
        </Group>
      </Group>
      {/* Force remount of inputs on mode change to isolate Controllers */}
      <div key={`mode-${mode}`}>
        <Form id="product-form" method="post">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            {[
              productIdentityFields,
              productAssocFields,
              productPricingFields,
            ].map((group, idx) => (
              <Card key={idx} withBorder padding="md">
                <Stack gap={6}>
                  {group.map((f) =>
                    renderField(activeForm as any, f, mode as any, product, {
                      categoryOptions: (categoryOptions as any).map(
                        (o: any) => ({ value: String(o.value), label: o.label })
                      ),
                      taxCodeOptions: (taxCodeOptions as any).map((o: any) => ({
                        value: String(o.value),
                        label: o.label,
                      })),
                    })
                  )}
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        </Form>

        {/* Find-only criteria row */}
        {mode === "find" && (
          <Card withBorder padding="md">
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  {productBomFindFields.map((f) => (
                    <Table.Th key={f.name}>{f.label}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {productBomFindFields.map((f) => (
                    <Table.Td key={f.name}>
                      {renderField(
                        findForm as any,
                        f,
                        "find",
                        {},
                        {
                          categoryOptions: (categoryOptions as any).map(
                            (o: any) => ({
                              value: String(o.value),
                              label: o.label,
                            })
                          ),
                          taxCodeOptions: (taxCodeOptions as any).map(
                            (o: any) => ({
                              value: String(o.value),
                              label: o.label,
                            })
                          ),
                        }
                      )}
                    </Table.Td>
                  ))}
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
      {/* Legacy BOM find criteria block removed (now handled above) */}
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
                    <Badge variant="light">
                      Global: {Number((product as any).stockQty ?? 0)}
                    </Badge>
                  </Group>
                </Card.Section>
                <Table
                  striped
                  withTableBorder
                  withColumnBorders
                  highlightOnHover
                >
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Location</Table.Th>
                      <Table.Th>Qty</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(stockByLocation || []).map((row: any) => (
                      <Table.Tr key={row.location_id ?? "none"}>
                        <Table.Td>
                          {row.location_name ||
                            `${row.location_id ?? "(none)"}`}
                        </Table.Td>
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
                <Table
                  striped
                  withTableBorder
                  withColumnBorders
                  highlightOnHover
                >
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
                              {row.code_sartor
                                ? (row.code_mill ? " | " : "") + row.code_sartor
                                : ""}
                            </>
                          ) : (
                            `${row.batch_id}`
                          )}
                        </Table.Td>
                        <Table.Td>{row.batch_name || ""}</Table.Td>
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
                    ? (movements || []).map((ml) => (
                        <Table.Tr key={`line-${ml.id}`}>
                          <Table.Td>
                            {ml.movement?.date
                              ? new Date(ml.movement.date).toLocaleDateString()
                              : ""}
                          </Table.Td>
                          <Table.Td>{ml.movement?.movementType || ""}</Table.Td>
                          <Table.Td>
                            {ml.movement?.locationOutId != null
                              ? locationNameById?.[ml.movement.locationOutId] ||
                                ml.movement.locationOutId
                              : ""}
                          </Table.Td>
                          <Table.Td>
                            {ml.movement?.locationInId != null
                              ? locationNameById?.[ml.movement.locationInId] ||
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
                      ))
                    : (movementHeaders || []).map((mh) => (
                        <Table.Tr key={`hdr-${mh.id}`}>
                          <Table.Td>
                            {mh.date
                              ? new Date(mh.date).toLocaleDateString()
                              : ""}
                          </Table.Td>
                          <Table.Td>{mh.movementType || ""}</Table.Td>
                          <Table.Td>
                            {mh.locationOutId != null
                              ? locationNameById?.[mh.locationOutId] ||
                                mh.locationOutId
                              : ""}
                          </Table.Td>
                          <Table.Td>
                            {mh.locationInId != null
                              ? locationNameById?.[mh.locationInId] ||
                                mh.locationInId
                              : ""}
                          </Table.Td>
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
      {/* Add Component Picker (single instance near top return) */}
      <Modal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add Component"
        size="xl"
        centered
      >
        <Stack>
          <Group justify="space-between" align="flex-end">
            <TextInput
              placeholder="Search products..."
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.currentTarget.value)}
              w={320}
            />
            <Checkbox
              label="Assembly Item"
              checked={assemblyItemOnly}
              onChange={(e) => setAssemblyItemOnly(e.currentTarget.checked)}
            />
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
}
