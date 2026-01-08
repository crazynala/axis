import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
  useActionData,
} from "@remix-run/react";
import { Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { useEffect, useMemo } from "react";
import { loadBoxDetail } from "../services/boxDetail.server";
import { useRecords } from "~/base/record/RecordContext";
import { buildBoxEditDefaults, useBoxFindify } from "../findify/boxFindify";
import { BoxDetailForm } from "../components/BoxDetailForm";
import { prismaBase } from "~/utils/prisma.server";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import {
  normalizeBreakdownToLabels,
  resolveVariantSourceFromLine,
} from "~/utils/variantBreakdown";
import { EntityAuditFooter } from "~/base/detail/EntityAuditFooter";

const boxStateConfig = {
  states: {
    open: { label: "Open", color: "blue" },
    sealed: { label: "Sealed", color: "grape" },
    shipped: { label: "Shipped", color: "green" },
  },
  transitions: {
    open: ["sealed"],
    sealed: ["open"],
    shipped: [],
  },
  transitionMeta: {
    "open->sealed": {
      title: "Seal this box?",
      text: "This marks the box as sealed and ready to ship.",
      confirmLabel: "Seal box",
      cancelLabel: "Cancel",
    },
    "sealed->open": {
      title: "Reopen this box?",
      text: "This will mark the box as open for further changes.",
      confirmLabel: "Reopen box",
      cancelLabel: "Cancel",
    },
  },
};

export async function loader({ params }: LoaderFunctionArgs) {
  const idStr = params.id;
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) {
    throw new Response("Invalid box id", { status: 400 });
  }
  const box = await loadBoxDetail(id);
  if (!box) {
    throw new Response("Not found", { status: 404 });
  }
  return json({ box });
}

function toInt(value: FormDataEntryValue | null) {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function emptyToNull(value: FormDataEntryValue | null) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

export async function action({ request, params }: ActionFunctionArgs) {
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const idStr = params.id;
  const id = Number(idStr);
  if (!idStr || Number.isNaN(id)) {
    return json({ error: "Invalid box id" }, { status: 400 });
  }
  if (intent === "update") {
    const data: any = {
      code: emptyToNull(form.get("code")),
      description: emptyToNull(form.get("description")),
      notes: emptyToNull(form.get("notes")),
      companyId: toInt(form.get("companyId")) || null,
      locationId: toInt(form.get("locationId")) || null,
      shipmentId: toInt(form.get("shipmentId")) || null,
      warehouseNumber: toInt(form.get("warehouseNumber")),
      shipmentNumber: toInt(form.get("shipmentNumber")),
    };
    await prismaBase.box.update({ where: { id }, data });
    return redirect(`/boxes/${id}`);
  }
  if (intent === "box.setState") {
    const state = emptyToNull(form.get("state")) || "open";
    if (state === "shipped") {
      return json(
        {
          error:
            "Boxes are marked shipped via Shipments. Update the shipment instead.",
        },
        { status: 400 }
      );
    }
    if (state !== "open" && state !== "sealed") {
      return json(
        { error: "Invalid box state." },
        { status: 400 }
      );
    }
    await prismaBase.box.update({ where: { id }, data: { state } });
    return redirect(`/boxes/${id}`);
  }
  return json({ ok: false, error: "Unknown intent" }, { status: 400 });
}

export default function BoxDetailRoute() {
  const { box } = useLoaderData<{ box: any }>();
  const { setCurrentId } = useRecords();
  useEffect(() => {
    setCurrentId(box.id, "restore");
  }, [box.id, setCurrentId]);
  const submit = useSubmit();
  const actionData = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const {
    editForm,
    buildUpdatePayload,
  } = useBoxFindify(box, nav);

  useEffect(() => {
    editForm.reset(buildBoxEditDefaults(box));
  }, [box, editForm]);

  useInitGlobalFormContext(
    editForm as any,
    (values: any) => {
      const payload = buildUpdatePayload(values);
      submit(payload, { method: "post" });
    },
    () => editForm.reset(buildBoxEditDefaults(box))
  );

  const activeForm = editForm;
  const stateValue = String(box.state || "open");
  const fieldCtx = { isShipped: stateValue === "shipped" };

  useEffect(() => {
    if (actionData?.error) {
      notifications.show({
        color: "red",
        title: "Unable to change state",
        message: actionData.error,
      });
    }
  }, [actionData?.error]);

  const totalQuantity = useMemo(() => {
    return (box.lines || []).reduce((sum: number, line: any) => {
      const value = line.quantity ? Number(line.quantity) : 0;
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [box.lines]);
  const renderLineBreakdown = (line: any) => {
    const variantSource = resolveVariantSourceFromLine(line);
    const labels = (variantSource?.variants || [])
      .map((label) => (label ?? "").trim())
      .filter((label) => label.length > 0);
    if (!labels.length) return "—";
    const values = normalizeBreakdownToLabels(
      labels,
      Array.isArray(line.qtyBreakdown) ? line.qtyBreakdown : [],
      true
    );
    if (!values.some((v) => v !== 0)) return "—";
    return (
      <Group gap={6} wrap="wrap">
        {labels.map((label, idx) => {
          const value = values[idx];
          if (!value) return null;
          return (
            <Group key={`${line.id}-${label}`} gap={4} wrap="nowrap">
              <Text size="xs" c="dimmed">
                {label}
              </Text>
              <Text
                size="xs"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {value}
              </Text>
            </Group>
          );
        })}
      </Group>
    );
  };

  return (
    <Stack gap="lg">
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Boxes", href: "/boxes" },
          { label: box.code || `Box #${box.id}`, href: `/boxes/${box.id}` },
        ]}
      />
      <Group justify="space-between" align="center">
        <Title order={2}>{box.code || `Box #${box.id}`}</Title>
        <Group gap="md" align="center">
          <StateChangeButton
            value={stateValue}
            defaultValue={stateValue}
            onChange={(next) => {
              const fd = new FormData();
              fd.set("_intent", "box.setState");
              fd.set("state", next);
              submit(fd, { method: "post" });
            }}
            disabled={editForm.formState.isDirty || stateValue === "shipped"}
            config={boxStateConfig}
          />
        </Group>
      </Group>
      <BoxDetailForm mode={"edit"} form={activeForm} fieldCtx={fieldCtx} />
      <Card withBorder padding="md" radius="md">
        <Group justify="space-between" align="center" mb="md">
          <Text fw={600}>Lines ({box.lines?.length || 0})</Text>
          <Text size="sm" c="dimmed">
            Total Qty: {totalQuantity}
          </Text>
        </Group>
        <Stack gap="md">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>ID</Table.Th>
                <Table.Th>Product</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Assembly</Table.Th>
                <Table.Th>Qty</Table.Th>
                <Table.Th>Breakdown</Table.Th>
                <Table.Th>Notes</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(box.lines || []).map((line: any) => (
                <Table.Tr key={line.id}>
                  <Table.Td>{line.id}</Table.Td>
                  <Table.Td>
                    {line.product ? (
                      <Group gap={4} wrap="nowrap">
                        <Link to={`/products/${line.product.id}`}>
                          {line.product.sku || `Product #${line.product.id}`}
                        </Link>
                        <Text size="sm" c="dimmed">
                          {line.product.name || ""}
                        </Text>
                      </Group>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {line.job ? (
                      <Link to={`/jobs/${line.job.id}`}>
                        {line.job.projectCode ||
                          line.job.name ||
                          `Job #${line.job.id}`}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {line.assembly && line.jobId ? (
                      <Link
                        to={`/jobs/${line.jobId}/assembly/${line.assembly.id}`}
                      >
                        {line.assembly.name || `Assembly #${line.assembly.id}`}
                      </Link>
                    ) : line.assembly ? (
                      line.assembly.name || `Assembly #${line.assembly.id}`
                    ) : (
                      "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {line.quantity ? Number(line.quantity) : "—"}
                  </Table.Td>
                  <Table.Td>{renderLineBreakdown(line)}</Table.Td>
                  <Table.Td>{line.notes || ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      </Card>
      <EntityAuditFooter
        createdAt={box.createdAt ?? null}
        createdBy={box.createdBy ?? null}
        updatedAt={box.updatedAt ?? null}
        updatedBy={box.modifiedBy ?? null}
      />
    </Stack>
  );
}
