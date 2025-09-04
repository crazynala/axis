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
} from "@remix-run/react";
import {
  Stack,
  Title,
  Group,
  Text,
  Button,
  Card,
  Divider,
  Table,
  SimpleGrid,
  Badge,
} from "@mantine/core";
import { TextInput, Checkbox, NumberInput, Modal } from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import { useMemo, useState } from "react";
import {
  BreadcrumbSet,
  useRecordBrowser,
  RecordNavButtons,
  useRecordBrowserShortcuts,
  useInitGlobalFormContext,
} from "packages/timber";

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
  // Compute per-location stock attributing inbound to locationInId and outbound to locationOutId
  // Includes extended synonyms for movement types and uses ABS for robustness
  const byLocation = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH typed AS (
      SELECT
        CASE
          WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (
            'in','receive','purchase','adjust_in','return_in','return','transfer_in','po (receive)','shipping (in)'
          ) THEN pm."locationInId"
          WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (
            'out','issue','consume','ship','sale','deliver','adjust_out','transfer_out','shipping (out)','po (return)','assembly','expense'
          ) THEN pm."locationOutId"
          ELSE COALESCE(pm."locationId", pm."locationInId", pm."locationOutId")
        END AS lid,
        CASE
          WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (
            'in','receive','purchase','adjust_in','return_in','return','transfer_in','po (receive)','shipping (in)'
          ) THEN COALESCE(ABS(pml.quantity),0)
          WHEN lower(trim(COALESCE(pm."movementType", ''))) IN (
            'out','issue','consume','ship','sale','deliver','adjust_out','transfer_out','shipping (out)','po (return)','assembly','expense'
          ) THEN -COALESCE(ABS(pml.quantity),0)
          ELSE COALESCE(pml.quantity,0)
        END AS qty
      FROM "ProductMovementLine" pml
      JOIN "ProductMovement" pm ON pm.id = pml."movementId"
      WHERE pml."productId" = $1
    )
    SELECT l.id AS location_id, COALESCE(l.name,'') AS location_name, COALESCE(SUM(qty),0) AS qty
    FROM typed t
    LEFT JOIN "Location" l ON l.id = t.lid
    GROUP BY l.id, l.name
    ORDER BY l.name NULLS LAST, l.id
    `,
    id
  );
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
  return json({ product, stockByLocation: byLocation, productChoices });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
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
      if (form.has(k)) data[k] = form.get(k) === "on" || form.get(k) === "true";
    };
    str("name");
    str("description");
    num("costPrice");
    num("manualSalePrice");
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
  const { product, stockByLocation, productChoices } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  // Register local keyboard shortcuts for navigating records
  useRecordBrowserShortcuts(product.id);
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      name: product.name || "",
      description: product.description || "",
      costPrice: product.costPrice ?? undefined,
      manualSalePrice: product.manualSalePrice ?? undefined,
      stockTrackingEnabled: !!product.stockTrackingEnabled,
      batchTrackingEnabled: !!product.batchTrackingEnabled,
    },
  });
  type FormVals = any;
  const save = (values: FormVals) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    if (values.name) fd.set("name", values.name);
    if (values.description) fd.set("description", values.description);
    if (values.costPrice != null) fd.set("costPrice", String(values.costPrice));
    if (values.manualSalePrice != null)
      fd.set("manualSalePrice", String(values.manualSalePrice));
    if (values.stockTrackingEnabled) fd.set("stockTrackingEnabled", "on");
    if (values.batchTrackingEnabled) fd.set("batchTrackingEnabled", "on");
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext<FormVals>(form as any, save, () => form.reset());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [assemblyItemOnly, setAssemblyItemOnly] = useState(false);
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
        <Title order={2}>{product.name || `Product #${product.id}`}</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Products", href: "/products" },
            { label: String(product.id), href: `/products/${product.id}` },
          ]}
        />
      </Group>
      <RecordNavButtons recordBrowser={useRecordBrowser(product.id)} />

      {/* Top info cards */}
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Info</Title>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={6}>
            <Group gap="md">
              <Text fw={600} w={140}>
                ID | SKU
              </Text>
              <Text>
                #{product.id} {product.sku ? `| ${product.sku}` : ""}
              </Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Name
              </Text>
              <TextInput w={240} {...form.register("name")} />
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Description
              </Text>
              <TextInput w={300} {...form.register("description")} />
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Type
              </Text>
              <Text>{product.type || ""}</Text>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Relations</Title>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={6}>
            <Group gap="md">
              <Text fw={600} w={140}>
                Customer
              </Text>
              <Text>{product.customer?.name || ""}</Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Variant Set
              </Text>
              <Text>
                {product.variantSet?.name ||
                  (product.variantSet?.variants?.length
                    ? `${product.variantSet?.variants.length} variants`
                    : "")}
              </Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Stock Tracking
              </Text>
              <Controller
                name="stockTrackingEnabled"
                control={form.control}
                render={({ field }) => (
                  <Checkbox
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.currentTarget.checked)}
                    label={field.value ? "Enabled" : "Disabled"}
                  />
                )}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Batch Tracking
              </Text>
              <Controller
                name="batchTrackingEnabled"
                control={form.control}
                render={({ field }) => (
                  <Checkbox
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.currentTarget.checked)}
                    label={field.value ? "Enabled" : "Disabled"}
                  />
                )}
              />
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Commercial</Title>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={6}>
            <Group gap="md">
              <Text fw={600} w={160}>
                Cost Price
              </Text>
              <Controller
                name="costPrice"
                control={form.control}
                render={({ field }) => (
                  <NumberInput
                    w={160}
                    value={field.value as any}
                    onChange={(v) => field.onChange(v)}
                    allowDecimal
                  />
                )}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Manual Sale Price
              </Text>
              <Controller
                name="manualSalePrice"
                control={form.control}
                render={({ field }) => (
                  <NumberInput
                    w={160}
                    value={field.value as any}
                    onChange={(v) => field.onChange(v)}
                    allowDecimal
                  />
                )}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Purchase Tax
              </Text>
              <Text>{product.purchaseTax?.label || ""}</Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Category
              </Text>
              <Text>
                {product.category?.label || product.subCategory || ""}
              </Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Supplier
              </Text>
              <Text>{product.supplier?.name || ""}</Text>
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>

      {/* Bill of Materials */}
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

      {/* Stock by Location */}
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={4}>Stock by Location</Title>
            <Badge variant="light">
              Global: {Number((product as any).stockQty ?? 0)}
            </Badge>
          </Group>
        </Card.Section>
        <Divider my="xs" />
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
                <Table.Td>
                  {row.location_name || `#${row.location_id ?? "(none)"}`}
                </Table.Td>
                <Table.Td>{Number(row.qty ?? 0)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Add Component Picker */}
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
                <Text w={60}>#{p.id}</Text>
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
