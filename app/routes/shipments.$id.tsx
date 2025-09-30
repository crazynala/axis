import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../base/record/RecordContext";
import {
  Card,
  Divider,
  Group,
  Stack,
  Title,
  Table,
  Button,
} from "@mantine/core";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { ShipmentDetailForm } from "../modules/shipment/forms/ShipmentDetailForm";

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
      lines: { include: { product: true } },
      companyCarrier: { select: { id: true } },
      companySender: { select: { id: true } },
      companyReceiver: { select: { id: true } },
      location: { select: { id: true } },
    },
  });
  console.log("Returning shipment:", shipment);
  if (!shipment) throw new Response("Not found", { status: 404 });
  return json({ shipment });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (isNew || intent === "shipment.create") {
    const status = (form.get("status") as string) || null;
    const type = (form.get("type") as string) || null;
    const shipmentType = (form.get("shipmentType") as string) || null;
    const trackingNo = (form.get("trackingNo") as string) || null;
    const packingSlipCode = (form.get("packingSlipCode") as string) || null;
    const dateRaw = form.get("date") as string | null;
    const dateReceivedRaw = form.get("dateReceived") as string | null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    const max = await prisma.shipment.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    const created = await prisma.shipment.create({
      data: {
        id: nextId,
        status,
        type,
        shipmentType,
        trackingNo,
        packingSlipCode,
        date,
        dateReceived,
      } as any,
    });
    return redirect(`/shipments/${created.id}`);
  }
  if (intent === "shipment.update") {
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
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  useEffect(() => {
    setCurrentId(shipment.id);
  }, [shipment.id, setCurrentId]);
  const form = useForm({
    defaultValues: shipment,
    // id: shipment.id,
    // trackingNo: shipment.trackingNo || "",
    // status: shipment.status || "",
    // type: shipment.type || "",
    // packingSlipCode: shipment.packingSlipCode || "",
    // date: shipment.date
    //   ? new Date(shipment.date).toISOString().slice(0, 10)
    //   : "",
    // dateReceived: shipment.dateReceived
    //   ? new Date(shipment.dateReceived).toISOString().slice(0, 10)
    //   : "",
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
  // Prev/Next hotkeys handled globally in RecordProvider

  return (
    <Stack>
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Shipments", href: "/shipments" },
            { label: String(shipment.id), href: `/shipments/${shipment.id}` },
          ]}
        />
        <Group gap="xs"></Group>
      </Group>

      <ShipmentDetailForm mode="edit" form={form as any} shipment={shipment} />

      {shipment.lines?.length ? (
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={5}>Lines</Title>
          </Card.Section>
          <Table withColumnBorders withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>SKU</Table.Th>
                <Table.Th>Name</Table.Th>
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
                  <Table.Td>{l.product?.id ?? ""}</Table.Td>
                  <Table.Td>{l.product?.name ?? ""}</Table.Td>
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
