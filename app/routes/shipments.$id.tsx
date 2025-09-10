import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import {
  BreadcrumbSet,
  useRecordBrowser,
  useMasterTable,
  useRecordBrowserShortcuts,
  useInitGlobalFormContext,
  RecordNavButtons,
} from "@aa/timber";
import { Card, Divider, Group, Stack, Title, Table } from "@mantine/core";
import { useForm } from "react-hook-form";
import { ShipmentDetailForm } from "../components/ShipmentDetailForm";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  {
    title: data?.shipment
      ? `Shipment ${data.shipment.trackingNo ?? data.shipment.id}`
      : "Shipment",
  },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) throw new Response("Invalid id", { status: 400 });
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    include: {
      lines: true,
      companyCarrier: { select: { name: true } },
      companySender: { select: { name: true } },
      companyReceiver: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!shipment) throw new Response("Not found", { status: 404 });
  return json({ shipment });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  const form = await request.formData();
  if (form.get("_intent") === "shipment.update") {
    const status = (form.get("status") as string) || null;
    const type = (form.get("type") as string) || null;
    const trackingNo = (form.get("trackingNo") as string) || null;
    const packingSlipCode = (form.get("packingSlipCode") as string) || null;
    const dateRaw = form.get("date") as string | null;
    const dateReceivedRaw = form.get("dateReceived") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    await prisma.shipment.update({
      where: { id },
      data: { status, type, trackingNo, packingSlipCode, date, dateReceived },
    });
    return redirect(`/shipments/${id}`);
  }
  return redirect(`/shipments/${id}`);
}

export default function ShipmentDetailRoute() {
  const { shipment } = useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(shipment.id);
  const { records: masterRecords } = useMasterTable();
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      id: shipment.id,
      trackingNo: shipment.trackingNo || "",
      status: shipment.status || "",
      type: shipment.type || "",
      packingSlipCode: shipment.packingSlipCode || "",
      date: shipment.date
        ? new Date(shipment.date).toISOString().slice(0, 10)
        : "",
      dateReceived: shipment.dateReceived
        ? new Date(shipment.dateReceived).toISOString().slice(0, 10)
        : "",
    },
  });
  useInitGlobalFormContext(form as any, (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "shipment.update");
    fd.set("trackingNo", values.trackingNo || "");
    fd.set("status", values.status || "");
    fd.set("type", values.type || "");
    fd.set("packingSlipCode", values.packingSlipCode || "");
    fd.set("date", values.date || "");
    fd.set("dateReceived", values.dateReceived || "");
    submit(fd, { method: "post" });
  });
  const recordBrowser = useRecordBrowser(shipment.id, masterRecords);
  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Shipments", href: "/shipments" },
            { label: String(shipment.id), href: `/shipments/${shipment.id}` },
          ]}
        />
        <RecordNavButtons recordBrowser={recordBrowser} />
      </Group>

      <ShipmentDetailForm
        mode="edit"
        form={form as any}
        shipment={{
          ...shipment,
          carrierName: shipment.companyCarrier?.name,
          senderName: shipment.companySender?.name,
          receiverName: shipment.companyReceiver?.name,
          locationName: shipment.location?.name,
        }}
      />

      {shipment.lines?.length ? (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={5}>Lines</Title>
          </Card.Section>
          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Location</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {shipment.lines.map((l: any) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.id}</Table.Td>
                  <Table.Td>{l.productId ?? ""}</Table.Td>
                  <Table.Td>{l.quantity ?? ""}</Table.Td>
                  <Table.Td>{l.jobId ?? ""}</Table.Td>
                  <Table.Td>{l.locationId ?? ""}</Table.Td>
                  <Table.Td>{l.status ?? ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      ) : null}
    </Stack>
  );
}
