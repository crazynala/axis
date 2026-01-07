import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Card,
  Group,
  Stack,
  Table,
  Text,
  Title,
  Tabs,
} from "@mantine/core";
import { runWithDbActivity, prismaBase } from "~/utils/prisma.server";
import { requireUserId } from "~/utils/auth.server";

type MissingShipmentRow = {
  movementId: number;
  movementType: string | null;
  movementDate: Date | null;
  productId: number | null;
  quantity: number | null;
  shippingLineId: number | null;
  jobId: number | null;
  shipmentId: number | null;
  sku: string | null;
  notes: string | null;
};

type DupProduct = {
  id: number;
  sku: string | null;
  name: string | null;
  type: string | null;
};

type CustomerMismatch = {
  id: number;
  sku: string | null;
  name: string | null;
  type: string | null;
  customerId: number | null;
};

type FinishedNoSubcategory = {
  id: number;
  sku: string | null;
  name: string | null;
  type: string | null;
  category: string | null;
  subCategory: string | null;
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const missingShipments = await runWithDbActivity(
    "integrity.missingShipments",
    async () => {
      const rows = await prismaBase.$queryRaw<MissingShipmentRow[]>`
        SELECT pm.id AS "movementId",
               pm."movementType" AS "movementType",
               pm.date AS "movementDate",
               pm."productId" AS "productId",
               pm.quantity AS quantity,
               pm."shippingLineId" AS "shippingLineId",
               aa."jobId" AS "jobId",
               sl."shipmentId" AS "shipmentId",
               p.sku AS sku,
               pm.notes AS notes
        FROM "ProductMovement" pm
        LEFT JOIN "AssemblyActivity" aa ON aa.id = pm."assemblyActivityId"
        LEFT JOIN "ShipmentLine" sl ON sl.id = pm."shippingLineId"
        LEFT JOIN "Product" p ON p.id = pm."productId"
        WHERE (pm."movementType" ILIKE 'ship%' OR pm."movementType" ILIKE '%out%')
          AND pm."shippingLineId" IS NOT NULL
          AND sl.id IS NULL
        ORDER BY pm.date DESC, pm.id DESC
        LIMIT 500
      `;
      return rows;
    }
  );

  const dupProducts = await runWithDbActivity(
    "integrity.dupProducts",
    async () => {
      const rows = await prismaBase.product.findMany({
        where: { sku: { contains: "dup", mode: "insensitive" } },
        select: { id: true, sku: true, name: true, type: true },
        orderBy: [{ id: "asc" }],
        take: 500,
      });
      return rows as DupProduct[];
    }
  );

  const customerMismatches = await runWithDbActivity(
    "integrity.customerMismatches",
    async () => {
      const finishedNoCustomer = await prismaBase.product.findMany({
        where: {
          type: "Finished",
          OR: [{ customerId: null }, { customerId: { equals: 0 } }],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          customerId: true,
        },
        orderBy: [{ id: "asc" }],
        take: 500,
      });
      const nonFinishedWithCustomer = await prismaBase.product.findMany({
        where: {
          NOT: { type: "Finished" },
          customerId: { not: null },
        },
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          customerId: true,
        },
        orderBy: [{ id: "asc" }],
        take: 500,
      });
      return {
        finishedNoCustomer: finishedNoCustomer as CustomerMismatch[],
        nonFinishedWithCustomer: nonFinishedWithCustomer as CustomerMismatch[],
      };
    }
  );

  const finishedNoSubcategory = await runWithDbActivity(
    "integrity.finishedNoSubcategory",
    async () => {
      const rows = await prismaBase.product.findMany({
        where: {
          type: "Finished",
          category: {
            is: { label: { equals: "Finished Product", mode: "insensitive" } },
          },
          OR: [{ subCategoryId: null }],
        },
        select: {
          id: true,
          sku: true,
          name: true,
          type: true,
          category: { select: { label: true } },
          subCategory: true,
        },
        orderBy: [{ id: "asc" }],
        take: 500,
      });
      return rows.map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        type: r.type,
        category: (r as any).category?.label ?? null,
        subCategory: r.subCategory,
      })) as FinishedNoSubcategory[];
    }
  );

  return json({
    missingShipments,
    dupProducts,
    customerMismatches,
    finishedNoSubcategory,
  });
}

export default function IntegrityIndexRoute() {
  const { missingShipments, dupProducts, customerMismatches, finishedNoSubcategory } =
    useLoaderData<typeof loader>();

  return (
    <Stack gap="lg">
      <Title order={2}>Integrity</Title>
      <Text c="dimmed" size="sm">
        Diagnostics to catch migration and validation issues. Fix upstream data sources where possible.
      </Text>
      <Tabs defaultValue="shipments">
        <Tabs.List>
          <Tabs.Tab value="shipments">Ship (Out) without Shipment</Tabs.Tab>
          <Tabs.Tab value="dups">Products with "dup" in SKU</Tabs.Tab>
          <Tabs.Tab value="customer-mismatch">Customer Mismatches</Tabs.Tab>
          <Tabs.Tab value="finished-subcategory">
            Finished Products missing subcategory
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="shipments" pt="md">
          <Card withBorder padding="md">
            <Title order={4}>Ship (Out) movements missing Shipment</Title>
            {missingShipments.length === 0 ? (
              <Text size="sm" c="dimmed">
                No issues found.
              </Text>
            ) : (
              <Table withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Product</Table.Th>
                    <Table.Th>Job</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Ship Line</Table.Th>
                    <Table.Th>Notes</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {missingShipments.map((row) => (
                    <Table.Tr key={row.movementId}>
                      <Table.Td>
                        <Link to={`/products/movements/${row.movementId}`}>
                          {row.movementId}
                        </Link>
                      </Table.Td>
                      <Table.Td>
                        {row.movementDate
                          ? new Date(row.movementDate).toLocaleDateString()
                          : "—"}
                      </Table.Td>
                      <Table.Td>{row.movementType || "—"}</Table.Td>
                      <Table.Td>
                        {row.productId ? (
                          <Link to={`/products/${row.productId}`}>
                            {row.sku || row.productId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Table.Td>
                      <Table.Td>
                        {row.jobId ? (
                          <Link
                            to={`/jobs/${row.jobId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Job {row.jobId}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Table.Td>
                      <Table.Td>{row.quantity ?? "—"}</Table.Td>
                      <Table.Td>
                        {row.shippingLineId != null
                          ? `Line ${row.shippingLineId}`
                          : "—"}
                      </Table.Td>
                      <Table.Td>{row.notes || "—"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="dups" pt="md">
          <Card withBorder padding="md">
            <Title order={4}>Products with "dup" in SKU</Title>
            {dupProducts.length === 0 ? (
              <Text size="sm" c="dimmed">
                No duplicates detected.
              </Text>
            ) : (
              <Table withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Type</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {dupProducts.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Link to={`/products/${p.id}`}>{p.id}</Link>
                      </Table.Td>
                      <Table.Td>{p.sku || "—"}</Table.Td>
                      <Table.Td>{p.name || "—"}</Table.Td>
                      <Table.Td>{p.type || "—"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
        <Tabs.Panel value="customer-mismatch" pt="md">
          <Stack gap="md">
            <Card withBorder padding="md">
              <Title order={4}>Finished products without customer</Title>
              {customerMismatches.finishedNoCustomer.length === 0 ? (
                <Text size="sm" c="dimmed">
                  None found.
                </Text>
              ) : (
                <Table withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>SKU</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Customer</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {customerMismatches.finishedNoCustomer.map((p) => (
                      <Table.Tr key={`fnc-${p.id}`}>
                        <Table.Td>
                          <Link to={`/products/${p.id}`}>{p.id}</Link>
                        </Table.Td>
                        <Table.Td>{p.sku || "—"}</Table.Td>
                        <Table.Td>{p.name || "—"}</Table.Td>
                        <Table.Td>{p.type || "—"}</Table.Td>
                        <Table.Td>{p.customerId ?? "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
            <Card withBorder padding="md">
              <Title order={4}>Non-finished products with customer set</Title>
              {customerMismatches.nonFinishedWithCustomer.length === 0 ? (
                <Text size="sm" c="dimmed">
                  None found.
                </Text>
              ) : (
                <Table withColumnBorders highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>ID</Table.Th>
                      <Table.Th>SKU</Table.Th>
                      <Table.Th>Name</Table.Th>
                      <Table.Th>Type</Table.Th>
                      <Table.Th>Customer</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {customerMismatches.nonFinishedWithCustomer.map((p) => (
                      <Table.Tr key={`nfc-${p.id}`}>
                        <Table.Td>
                          <Link to={`/products/${p.id}`}>{p.id}</Link>
                        </Table.Td>
                        <Table.Td>{p.sku || "—"}</Table.Td>
                        <Table.Td>{p.name || "—"}</Table.Td>
                        <Table.Td>{p.type || "—"}</Table.Td>
                        <Table.Td>{p.customerId ?? "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
            </Card>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="finished-subcategory" pt="md">
          <Card withBorder padding="md">
            <Title order={4}>Finished Products missing Subcategory</Title>
            {finishedNoSubcategory.length === 0 ? (
              <Text size="sm" c="dimmed">
                No issues found.
              </Text>
            ) : (
              <Table withColumnBorders highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>ID</Table.Th>
                    <Table.Th>SKU</Table.Th>
                    <Table.Th>Name</Table.Th>
                    <Table.Th>Category</Table.Th>
                    <Table.Th>Subcategory</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {finishedNoSubcategory.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Link to={`/products/${p.id}`}>{p.id}</Link>
                      </Table.Td>
                      <Table.Td>{p.sku || "—"}</Table.Td>
                      <Table.Td>{p.name || "—"}</Table.Td>
                      <Table.Td>{p.category || "—"}</Table.Td>
                      <Table.Td>{p.subCategory || "—"}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
