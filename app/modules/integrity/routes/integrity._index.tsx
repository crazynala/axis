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
               sl."shipmentId" AS "shipmentId",
               p.sku AS sku,
               pm.notes AS notes
        FROM "ProductMovement" pm
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

  return json({ missingShipments, dupProducts });
}

export default function IntegrityIndexRoute() {
  const { missingShipments, dupProducts } =
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
      </Tabs>
    </Stack>
  );
}
