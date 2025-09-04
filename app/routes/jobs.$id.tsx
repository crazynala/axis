import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { Stack, Title, Group, Table, Text } from "@mantine/core";
import { BreadcrumbSet, useRecordBrowser, RecordNavButtons, useRecordBrowserShortcuts } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Job" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const job = await prisma.job.findUnique({
    where: { id },
    include: { assemblies: true, company: true },
  });
  if (!job) throw new Response("Not Found", { status: 404 });
  // Gather product details for assemblies
  const productIds = Array.from(new Set((job.assemblies || []).map((a: any) => a.productId).filter(Boolean))) as number[];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          variantSet: { select: { name: true } },
        },
      })
    : [];
  const productsById: Record<number, any> = Object.fromEntries(products.map((p: any) => [p.id, p]));
  return json({ job, productsById });
}

export default function JobDetailRoute() {
  const { job, productsById } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(job.id);
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Job</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: String(job.id), href: `/jobs/${job.id}` },
          ]}
        />
      </Group>
      <RecordNavButtons recordBrowser={useRecordBrowser(job.id)} />

      <section>
        <Title order={4} mb="xs">
          Info
        </Title>
        <Stack gap={4} styles={() => ({ root: { maxWidth: 720 } } as any)}>
          <Group gap="md">
            <Text fw={600} w={120}>
              Project Code
            </Text>
            <Text>{(job as any).projectCode || ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Name
            </Text>
            <Text>{job.name || ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Customer
            </Text>
            <Text>{(job as any).company?.name || (job as any).endCustomerName || ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Status
            </Text>
            <Text>{job.status || ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Active
            </Text>
            <Text>{(job as any).isActive ? "Yes" : "No"}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Start
            </Text>
            <Text>{(job as any).startDate ? new Date((job as any).startDate).toLocaleString() : ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              End
            </Text>
            <Text>{(job as any).endDate ? new Date((job as any).endDate).toLocaleString() : ""}</Text>
          </Group>
          <Group gap="md">
            <Text fw={600} w={120}>
              Notes
            </Text>
            <Text>{job.notes || ""}</Text>
          </Group>
        </Stack>
      </section>

      <section>
        <Title order={4} mb="xs">
          Assemblies
        </Title>
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Product SKU</Table.Th>
              <Table.Th>Product Name</Table.Th>
              <Table.Th>Variant Set</Table.Th>
              <Table.Th># Ordered</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(job.assemblies || []).map((a: any) => {
              const p = a.productId ? (productsById as any)[a.productId] : null;
              return (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Link to={`/assembly/${a.id}`}>{a.id}</Link>
                  </Table.Td>
                  <Table.Td>{p?.sku || ""}</Table.Td>
                  <Table.Td>{p?.name || ""}</Table.Td>
                  <Table.Td>{p?.variantSet?.name || ""}</Table.Td>
                  <Table.Td>{(a as any).qtyOrdered ?? ""}</Table.Td>
                  <Table.Td>{a.status || ""}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </section>
    </Stack>
  );
}
