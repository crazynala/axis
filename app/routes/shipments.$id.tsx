import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Outlet, useRouteLoaderData, useSubmit } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useRecordContext } from "../base/record/RecordContext";
import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm, useWatch } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { ShipmentDetailForm } from "../modules/shipment/forms/ShipmentDetailForm";
import { AttachBoxesModal } from "../modules/shipment/components/AttachBoxesModal";
import { VariantBreakdownSection } from "../components/VariantBreakdownSection";
import {
  groupVariantBreakdowns,
  resolveVariantSourceFromLine,
} from "../utils/variantBreakdown";

const ALLOWED_BOX_STATES = new Set(["open", "sealed"]);

function buildShipmentLineKey(
  jobId: number | null,
  assemblyId: number | null,
  productId: number | null,
  variantSetId: number | null
) {
  return [
    jobId ?? "null",
    assemblyId ?? "null",
    productId ?? "null",
    variantSetId ?? "null",
  ].join("|");
}

function sumNumberArray(values: number[]): number {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function mergeBreakdowns(existing: number[], incoming: number[]): number[] {
  const length = Math.max(existing.length, incoming.length);
  return Array.from({ length }, (_, index) => {
    const prev = Number(existing[index] ?? 0) || 0;
    const next = Number(incoming[index] ?? 0) || 0;
    return prev + next;
  });
}

function lineQuantityOrSum(line: {
  quantity: any;
  qtyBreakdown: number[] | null;
}) {
  const qtyNumber = Number(line.quantity ?? 0);
  if (Number.isFinite(qtyNumber) && qtyNumber !== 0) return qtyNumber;
  return sumNumberArray(
    Array.isArray(line.qtyBreakdown) ? line.qtyBreakdown : []
  );
}

function parseBoxIdList(value: FormDataEntryValue | null): number[] {
  if (value == null) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .map((entry) => Number(entry))
          .filter((entry) => Number.isFinite(entry)) as number[]
      )
    );
  } catch {
    return [];
  }
}

async function attachBoxesToShipment(shipmentId: number, boxIds: number[]) {
  if (!Number.isFinite(shipmentId)) return;
  const normalizedIds = Array.from(
    new Set(boxIds.map((id) => Number(id)).filter((id) => Number.isFinite(id)))
  ) as number[];
  if (!normalizedIds.length) return;
  await prisma.$transaction(async (tx) => {
    const shipmentRecord = await tx.shipment.findUnique({
      where: { id: shipmentId },
      select: { id: true, locationId: true },
    });
    if (!shipmentRecord) {
      throw new Error("Shipment not found");
    }
    const boxes = await tx.box.findMany({
      where: { id: { in: normalizedIds } },
      include: {
        location: { select: { id: true } },
        company: { select: { id: true, name: true } },
        lines: {
          select: {
            id: true,
            productId: true,
            quantity: true,
            qtyBreakdown: true,
            jobId: true,
            assemblyId: true,
            assembly: {
              select: {
                id: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
          },
        },
      },
    });
    if (boxes.length !== normalizedIds.length) {
      throw new Error("One or more boxes could not be loaded");
    }
    const invalidBox = boxes.find((box) => {
      const state = String(box.state ?? "").toLowerCase();
      const wrongLocation =
        shipmentRecord.locationId != null &&
        shipmentRecord.locationId !== box.locationId;
      return (
        box.shipmentId != null ||
        wrongLocation ||
        !ALLOWED_BOX_STATES.has(state)
      );
    });
    if (invalidBox) {
      throw new Error("Selected boxes are no longer available");
    }
    const maxNumber = await tx.box.aggregate({
      where: { shipmentId },
      _max: { shipmentNumber: true },
    });
    let nextShipmentNumber = (maxNumber._max.shipmentNumber ?? 0) + 1;
    const maxShipmentLine = await tx.shipmentLine.aggregate({
      _max: { id: true },
    });
    let nextShipmentLineId = (maxShipmentLine._max.id || 0) + 1;
    type Group = {
      jobId: number | null;
      assemblyId: number | null;
      productId: number | null;
      variantSetId: number | null;
      qtyBreakdown: number[];
      quantity: number;
      boxLineIds: number[];
    };
    const groups = new Map<string, Group>();
    for (const box of boxes) {
      await tx.box.update({
        where: { id: box.id },
        data: {
          shipmentId,
          shipmentNumber: nextShipmentNumber++,
        },
      });
      for (const line of box.lines) {
        const qtyBreakdown = Array.isArray(line.qtyBreakdown)
          ? (line.qtyBreakdown as number[])
          : [];
        const key = buildShipmentLineKey(
          line.jobId ?? null,
          line.assemblyId ?? null,
          line.productId ?? null,
          line.assembly?.variantSetId ?? null
        );
        if (!groups.has(key)) {
          groups.set(key, {
            jobId: line.jobId ?? null,
            assemblyId: line.assemblyId ?? null,
            productId: line.productId ?? null,
            variantSetId: line.assembly?.variantSetId ?? null,
            qtyBreakdown: [],
            quantity: 0,
            boxLineIds: [],
          });
        }
        const current = groups.get(key)!;
        current.qtyBreakdown = mergeBreakdowns(
          current.qtyBreakdown,
          qtyBreakdown
        );
        current.quantity += lineQuantityOrSum({
          quantity: line.quantity,
          qtyBreakdown,
        });
        current.boxLineIds.push(line.id);
      }
    }
    const existingLines = await tx.shipmentLine.findMany({
      where: { shipmentId },
      select: {
        id: true,
        jobId: true,
        assemblyId: true,
        productId: true,
        variantSetId: true,
        qtyBreakdown: true,
        quantity: true,
      },
    });
    const existingMap = new Map(
      existingLines.map((line) => [
        buildShipmentLineKey(
          line.jobId ?? null,
          line.assemblyId ?? null,
          line.productId ?? null,
          line.variantSetId ?? null
        ),
        line,
      ])
    );
    for (const group of groups.values()) {
      const key = buildShipmentLineKey(
        group.jobId,
        group.assemblyId,
        group.productId,
        group.variantSetId
      );
      const existing = existingMap.get(key);
      let shipmentLineId: number;
      if (existing) {
        const mergedBreakdown = mergeBreakdowns(
          Array.isArray(existing.qtyBreakdown)
            ? (existing.qtyBreakdown as number[])
            : [],
          group.qtyBreakdown
        );
        const updated = await tx.shipmentLine.update({
          where: { id: existing.id },
          data: {
            qtyBreakdown: mergedBreakdown as any,
            quantity:
              Number(existing.quantity ?? 0) +
              (group.quantity || sumNumberArray(group.qtyBreakdown)),
          },
        });
        shipmentLineId = updated.id;
        existingMap.set(key, {
          ...updated,
          qtyBreakdown: mergedBreakdown as any,
        });
      } else {
        const created = await tx.shipmentLine.create({
          data: {
            id: nextShipmentLineId++,
            shipmentId,
            jobId: group.jobId ?? undefined,
            assemblyId: group.assemblyId ?? undefined,
            productId: group.productId ?? undefined,
            variantSetId: group.variantSetId ?? undefined,
            qtyBreakdown: group.qtyBreakdown as any,
            quantity: group.quantity || sumNumberArray(group.qtyBreakdown),
            status: "Packed",
          },
        });
        shipmentLineId = created.id;
        existingMap.set(key, created);
      }
      await tx.boxLine.updateMany({
        where: { id: { in: group.boxLineIds } },
        data: { shipmentLineId },
      });
    }
  });
}

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
      // include name so we can populate read-only locationName in the form defaults
      location: { select: { id: true, name: true } },
    },
  });
  console.log("Returning shipment:", shipment);
  if (!shipment) return redirect("/shipments");
  const [attachedBoxes, availableBoxes] = await Promise.all([
    prisma.box.findMany({
      where: { shipmentId: shipment.id },
      orderBy: { shipmentNumber: "asc" },
      include: {
        company: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: {
          orderBy: { id: "asc" },
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
            job: { select: { id: true, name: true } },
            assembly: {
              select: {
                id: true,
                name: true,
                variantSetId: true,
                variantSet: {
                  select: { id: true, name: true, variants: true },
                },
              },
            },
          },
        },
      },
    }),
    shipment.locationId
      ? prisma.box.findMany({
          where: {
            shipmentId: null,
            locationId: shipment.locationId,
            state: { in: ["open", "sealed"] },
          },
          orderBy: [{ warehouseNumber: "asc" }, { id: "asc" }],
          include: {
            company: { select: { id: true, name: true } },
            location: { select: { id: true, name: true } },
            lines: {
              select: {
                id: true,
                productId: true,
                quantity: true,
                qtyBreakdown: true,
                jobId: true,
                job: { select: { id: true, name: true } },
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    variantSetId: true,
                    variantSet: {
                      select: { id: true, name: true, variants: true },
                    },
                  },
                },
                assembly: {
                  select: {
                    id: true,
                    name: true,
                    variantSetId: true,
                    variantSet: {
                      select: { id: true, name: true, variants: true },
                    },
                  },
                },
              },
            },
          },
        })
      : [],
  ]);
  return json({ shipment, attachedBoxes, availableBoxes });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const isNew = idRaw === "new";
  const id = !isNew && idRaw ? Number(idRaw) : NaN;
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (isNew || intent === "shipment.create") {
    const status = "In Progress";
    const type = (form.get("type") as string) || null;
    const shipmentType = (form.get("shipmentType") as string) || null;
    const trackingNo = (form.get("trackingNo") as string) || null;
    const packingSlipCode = (form.get("packingSlipCode") as string) || null;
    const dateRaw = form.get("date") as string | null;
    const dateReceivedRaw = form.get("dateReceived") as string | null;
    const companyIdReceiverRaw = form.get("companyIdReceiver") as string | null;
    const contactIdReceiverRaw = form.get("contactIdReceiver") as string | null;
    const companyIdReceiver = companyIdReceiverRaw
      ? Number(companyIdReceiverRaw)
      : null;
    const contactIdReceiver = contactIdReceiverRaw
      ? Number(contactIdReceiverRaw)
      : null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    const max = await prisma.shipment.aggregate({ _max: { id: true } });
    const nextId = (max._max.id || 0) + 1;
    let locationId: number | null = null;
    if (companyIdReceiver != null) {
      const company = await prisma.company.findUnique({
        where: { id: companyIdReceiver },
        select: { stockLocationId: true },
      });
      locationId = company?.stockLocationId ?? null;
    }
    if (locationId == null) locationId = 1;
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
        locationId,
        companyIdReceiver: Number.isFinite(Number(companyIdReceiver))
          ? (companyIdReceiver as any)
          : undefined,
        contactIdReceiver: Number.isFinite(Number(contactIdReceiver))
          ? (contactIdReceiver as any)
          : undefined,
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
    const companyIdReceiverRaw = form.get("companyIdReceiver") as string | null;
    const contactIdReceiverRaw = form.get("contactIdReceiver") as string | null;
    const pendingAttachBoxIds = parseBoxIdList(form.get("pendingAttachBoxIds"));
    const companyIdReceiver = companyIdReceiverRaw
      ? Number(companyIdReceiverRaw)
      : null;
    const contactIdReceiver = contactIdReceiverRaw
      ? Number(contactIdReceiverRaw)
      : null;
    const date = dateRaw ? new Date(dateRaw) : null;
    const dateReceived = dateReceivedRaw ? new Date(dateReceivedRaw) : null;
    await prisma.shipment.update({
      where: { id },
      data: {
        status,
        type,
        trackingNo,
        packingSlipCode,
        date,
        dateReceived,
        companyIdReceiver: Number.isFinite(Number(companyIdReceiver))
          ? (companyIdReceiver as any)
          : undefined,
        contactIdReceiver: Number.isFinite(Number(contactIdReceiver))
          ? (contactIdReceiver as any)
          : undefined,
      },
    });
    if (pendingAttachBoxIds.length) {
      await attachBoxesToShipment(id, pendingAttachBoxIds);
    }
    return redirect(`/shipments/${id}`);
  }
  if (intent === "shipment.attachBoxes") {
    if (!Number.isFinite(id)) return redirect("/shipments");
    const selectedIds = parseBoxIdList(form.get("boxIds"));
    await attachBoxesToShipment(id, selectedIds);
    return redirect(`/shipments/${id}`);
  }
  return redirect(`/shipments/${id}`);
}

export function ShipmentDetailView() {
  const {
    shipment,
    attachedBoxes = [],
    availableBoxes = [],
  } = useRouteLoaderData<typeof loader>("routes/shipments.$id")!;
  const { setCurrentId } = useRecordContext();
  const submit = useSubmit();
  const [activeTab, setActiveTab] = useState<string>("lines");
  const [attachOpen, { open: openAttach, close: closeAttach }] =
    useDisclosure(false);
  useEffect(() => {
    setCurrentId(shipment.id);
  }, [shipment.id, setCurrentId]);
  // Normalize loader data to match form field names and types used by the UI
  const toFormDefaults = (s: any) => ({
    ...s,
    // Address aliases used by the form
    addressCity: s.addressCity ?? s.addressTownCity ?? "",
    addressPostalCode: s.addressPostalCode ?? s.addressZipPostCode ?? "",
    // Normalize potential nulls to empty strings for text inputs
    addressName: s.addressName ?? "",
    addressLine1: s.addressLine1 ?? "",
    addressLine2: s.addressLine2 ?? "",
    addressLine3: s.addressLine3 ?? "",
    addressCountyState: s.addressCountyState ?? "",
    addressCountry: s.addressCountry ?? "",
    // Read-only derived display field
    locationName: s.location?.name ?? "",
    pendingAttachBoxIds: [],
  });
  const formDefaults = toFormDefaults(shipment);
  const form = useForm({
    defaultValues: formDefaults,
  });
  const pendingAttachBoxIds: number[] =
    useWatch({ control: form.control, name: "pendingAttachBoxIds" }) || [];
  const pendingAttachSet = useMemo(
    () => new Set(pendingAttachBoxIds.map((id) => Number(id))),
    [pendingAttachBoxIds]
  );
  const pendingBoxes = useMemo(() => {
    if (!availableBoxes?.length || !pendingAttachSet.size) return [] as any[];
    return (availableBoxes || []).filter((box: any) =>
      pendingAttachSet.has(box.id)
    );
  }, [availableBoxes, pendingAttachSet]);
  const attachableBoxes = useMemo(() => {
    if (!availableBoxes?.length) return [] as any[];
    if (!pendingAttachSet.size) return availableBoxes as any[];
    return (availableBoxes || []).filter(
      (box: any) => !pendingAttachSet.has(box.id)
    );
  }, [availableBoxes, pendingAttachSet]);
  const stagedAndSavedBoxes = useMemo(
    () => [
      ...(pendingBoxes || []).map((box: any) => ({ box, isPending: true })),
      ...(attachedBoxes || []).map((box: any) => ({ box, isPending: false })),
    ],
    [pendingBoxes, attachedBoxes]
  );
  useInitGlobalFormContext(
    form as any,
    (values: any) => {
      const fd = new FormData();
      fd.set("_intent", "shipment.update");
      fd.set("trackingNo", values.trackingNo || "");
      fd.set("status", values.status || "");
      fd.set("type", values.type || "");
      fd.set("packingSlipCode", values.packingSlipCode || "");
      fd.set("date", values.date || "");
      fd.set("dateReceived", values.dateReceived || "");
      if (values.companyIdReceiver != null)
        fd.set("companyIdReceiver", String(values.companyIdReceiver));
      if (values.contactIdReceiver != null)
        fd.set("contactIdReceiver", String(values.contactIdReceiver));
      fd.set(
        "pendingAttachBoxIds",
        JSON.stringify(values.pendingAttachBoxIds || [])
      );
      submit(fd, { method: "post" });
    },
    () => form.reset(toFormDefaults(shipment) as any)
  );
  useEffect(() => {
    const next = toFormDefaults(shipment);
    form.reset(next as any, { keepDirty: false, keepDefaultValues: false });
  }, [shipment, form]);
  const lineCount = shipment.lines?.length ?? 0;
  const boxSummaries = useMemo(() => {
    return stagedAndSavedBoxes.map(({ box, isPending }) => {
      const totalQuantity = (box.lines || []).reduce(
        (sum: number, line: any) =>
          sum +
          lineQuantityOrSum({
            quantity: line.quantity,
            qtyBreakdown: Array.isArray(line.qtyBreakdown)
              ? line.qtyBreakdown
              : [],
          }),
        0
      );
      const skuCount = Array.from(
        new Set(
          (box.lines || [])
            .map((line: any) => line.productId ?? line.product?.id ?? null)
            .filter((id: number | null): id is number => id != null)
        )
      ).length;
      return { box, totalQuantity, skuCount, isPending };
    });
  }, [stagedAndSavedBoxes]);
  const handleAttachConfirm = (boxIds: number[]) => {
    if (!boxIds.length) return;
    const current: number[] = form.getValues("pendingAttachBoxIds") || [];
    const merged = Array.from(
      new Set([...(current || []), ...boxIds])
    ) as number[];
    form.setValue("pendingAttachBoxIds", merged, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };
  const handleRemovePendingBox = (boxId: number) => {
    const current: number[] = form.getValues("pendingAttachBoxIds") || [];
    const next = current.filter((id) => Number(id) !== Number(boxId));
    form.setValue("pendingAttachBoxIds", next, {
      shouldDirty: true,
      shouldTouch: true,
    });
  };
  const canAttachBoxes = Boolean(
    shipment.locationId && (attachableBoxes?.length ?? 0) > 0
  );

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

      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "lines")}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="lines">Lines ({lineCount})</Tabs.Tab>
          <Tabs.Tab value="boxes">Boxes ({attachedBoxes.length})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lines" pt="md">
          {lineCount ? (
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
                      <Table.Td>{l.product?.sku ?? l.productId ?? ""}</Table.Td>
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
          ) : (
            <Text c="dimmed" mt="sm">
              No shipment lines yet.
            </Text>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="boxes" pt="md">
          <Card withBorder padding="md">
            <Group justify="space-between" align="center" mb="md">
              <Title order={5}>Boxes ({boxSummaries.length})</Title>
              <Button onClick={openAttach} disabled={!canAttachBoxes}>
                Attach boxes from warehouse…
              </Button>
            </Group>
            {pendingBoxes.length > 0 && (
              <Text size="sm" c="yellow.7" mb="sm">
                {pendingBoxes.length} box{pendingBoxes.length === 1 ? "" : "es"}{" "}
                pending – Save to commit or remove to discard.
              </Text>
            )}
            {boxSummaries.length ? (
              <Stack gap="md">
                {boxSummaries.map(
                  ({ box, totalQuantity, skuCount, isPending }) => {
                    const breakdownGroups = groupVariantBreakdowns(
                      box.lines || [],
                      {
                        getBreakdown: (line: any) =>
                          Array.isArray(line.qtyBreakdown)
                            ? line.qtyBreakdown
                            : [],
                        getVariant: (line: any) =>
                          resolveVariantSourceFromLine(line),
                        getItemKey: (line: any) => line.id,
                      }
                    );
                    return (
                      <Card key={box.id} withBorder padding="sm">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <Text fw={600}>
                              {box.warehouseNumber != null
                                ? `Box #${box.warehouseNumber}`
                                : box.code || `Box ${box.id}`}
                            </Text>
                            <Text size="sm" c="dimmed">
                              {box.company?.name ||
                                (box.companyId
                                  ? `Company ${box.companyId}`
                                  : "—")}
                            </Text>
                          </Stack>
                          <Group gap="lg" align="center">
                            <Stack gap={0} ta="right">
                              <Text size="sm">Total qty: {totalQuantity}</Text>
                              <Text size="sm">SKUs: {skuCount}</Text>
                            </Stack>
                            <Group gap="xs">
                              <Badge
                                color={
                                  box.state === "sealed"
                                    ? "green"
                                    : box.state === "open"
                                    ? "blue"
                                    : "gray"
                                }
                              >
                                {box.state || "unknown"}
                              </Badge>
                              {isPending && (
                                <Badge color="yellow">Pending Save</Badge>
                              )}
                            </Group>
                            {isPending && (
                              <Button
                                variant="subtle"
                                color="red"
                                size="xs"
                                onClick={() => handleRemovePendingBox(box.id)}
                              >
                                Remove
                              </Button>
                            )}
                          </Group>
                        </Group>
                        {box.lines?.length ? (
                          <Stack gap="sm" mt="sm">
                            <Table withColumnBorders>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th>SKU</Table.Th>
                                  <Table.Th>Product</Table.Th>
                                  <Table.Th>Qty</Table.Th>
                                  <Table.Th>Job</Table.Th>
                                  <Table.Th>Assembly</Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {box.lines.map((line: any) => (
                                  <Table.Tr key={line.id}>
                                    <Table.Td>
                                      {line.product?.sku ??
                                        line.productId ??
                                        ""}
                                    </Table.Td>
                                    <Table.Td>
                                      {line.product?.name || "—"}
                                    </Table.Td>
                                    <Table.Td>
                                      {line.quantity ??
                                        sumNumberArray(
                                          Array.isArray(line.qtyBreakdown)
                                            ? line.qtyBreakdown
                                            : []
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                      {line.job?.name ||
                                        (line.jobId
                                          ? `Job ${line.jobId}`
                                          : "—")}
                                    </Table.Td>
                                    <Table.Td>
                                      {line.assembly?.name ||
                                        (line.assemblyId
                                          ? `Assembly ${line.assemblyId}`
                                          : "—")}
                                    </Table.Td>
                                  </Table.Tr>
                                ))}
                              </Table.Tbody>
                            </Table>
                            {breakdownGroups.length > 0 && (
                              <VariantBreakdownSection
                                groups={breakdownGroups}
                                lineHeader="Line"
                                renderLineLabel={(line: any) => (
                                  <Stack gap={0}>
                                    <Text size="sm">
                                      {line.product?.sku ??
                                        line.productId ??
                                        `Line ${line.id}`}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                      {line.job?.name ||
                                        (line.jobId ? `Job ${line.jobId}` : "")}
                                    </Text>
                                  </Stack>
                                )}
                              />
                            )}
                          </Stack>
                        ) : (
                          <Text size="sm" c="dimmed" mt="sm">
                            No lines recorded for this box.
                          </Text>
                        )}
                      </Card>
                    );
                  }
                )}
              </Stack>
            ) : (
              <Text c="dimmed">
                No boxes attached or staged for this shipment.
              </Text>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>
      <AttachBoxesModal
        opened={attachOpen}
        onClose={closeAttach}
        shipmentId={shipment.id}
        shipmentLocationId={shipment.locationId ?? null}
        shipmentCustomerId={shipment.companyIdReceiver ?? null}
        boxes={attachableBoxes as any}
        onConfirm={(ids) => {
          handleAttachConfirm(ids);
          closeAttach();
        }}
      />
    </Stack>
  );
}

export default function ShipmentDetailLayout() {
  return <Outlet />;
}
