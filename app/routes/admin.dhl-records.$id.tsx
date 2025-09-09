import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet } from "@aa/timber";
import { Card, Divider, Group, Stack, TextInput, Title } from "@mantine/core";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.row
      ? `DHL ${data.row.awbNumber ?? data.row.id}`
      : "DHL Record",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const row = await prisma.dHLReportLine.findUnique({ where: { id } });
  if (!row) throw new Response("Not found", { status: 404 });
  return json({ row });
}

export default function AdminDHLRecordDetailRoute() {
  const { row } = useLoaderData<typeof loader>();
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Admin", href: "/admin" },
            { label: "DHL Records", href: "/admin/dhl-records" },
            { label: String(row.id), href: `/admin/dhl-records/${row.id}` },
          ]}
        />
      </Group>
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Title order={4}>DHL Record</Title>
        </Card.Section>
        <Divider my="xs" />
        <Stack gap={6}>
          <TextInput
            label="ID"
            value={String(row.id)}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Invoice"
            value={row.invoiceNumber || ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Date"
            value={
              row.invoiceDate
                ? new Date(row.invoiceDate).toISOString().slice(0, 10)
                : ""
            }
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="AWB"
            value={row.awbNumber || ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="From"
            value={row.originCountryCode || ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="To"
            value={row.destinationCountryCode || ""}
            readOnly
            mod="data-autoSize"
          />
          <TextInput
            label="Revenue EUR"
            value={String(row.totalRevenueEUR ?? "")}
            readOnly
            mod="data-autoSize"
          />
        </Stack>
      </Card>
    </Stack>
  );
}
