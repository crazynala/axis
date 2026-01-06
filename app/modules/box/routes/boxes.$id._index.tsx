import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import { Badge, Card, Group, Stack, Table, Text, Title } from "@mantine/core";
import { BreadcrumbSet, useInitGlobalFormContext } from "@aa/timber";
import { FindToggle } from "~/base/find/FindToggle";
import { useEffect, useMemo } from "react";
import { loadBoxDetail } from "../services/boxDetail.server";
import { useRecords } from "~/base/record/RecordContext";
import { buildBoxEditDefaults, useBoxFindify } from "../findify/boxFindify";
import { BoxDetailForm } from "../components/BoxDetailForm";
import { boxSearchSchema } from "../findify/box.search-schema";
import { buildWhere } from "~/base/find/buildWhere";
import { prismaBase } from "~/utils/prisma.server";
import { useFind } from "~/base/find/FindContext";
import { VariantBreakdownSection } from "~/components/VariantBreakdownSection";
import {
  groupVariantBreakdowns,
  resolveVariantSourceFromLine,
} from "~/utils/variantBreakdown";

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
      state: emptyToNull(form.get("state")) || "open",
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
  if (intent === "find") {
    const rawEntries = Array.from(form.entries()).filter(
      ([key]) => !key.startsWith("_")
    );
    const values: Record<string, any> = {};
    for (const [key, value] of rawEntries) {
      if (value == null || value === "") continue;
      values[key] = value;
    }
    const where = buildWhere(values, boxSearchSchema);
    const hasFilters = Array.isArray(where.AND) && where.AND.length > 0;
    if (!hasFilters) return redirect("/boxes");
    const first = await prismaBase.box.findFirst({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
    });
    if (first?.id) return redirect(`/boxes/${first.id}?find=1`);
    return redirect(`/boxes`);
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
  const nav = useNavigation();
  const {
    editForm,
    findForm,
    mode,
    enterFind,
    buildUpdatePayload,
    buildFindPayload,
  } = useBoxFindify(box, nav);
  const { registerFindCallback } = useFind();

  useEffect(
    () => registerFindCallback(() => enterFind()),
    [registerFindCallback, enterFind]
  );

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

  const activeForm = mode === "find" ? findForm : editForm;

  const totalQuantity = useMemo(() => {
    return (box.lines || []).reduce((sum: number, line: any) => {
      const value = line.quantity ? Number(line.quantity) : 0;
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
  }, [box.lines]);
  const lineBreakdownGroups = useMemo(
    () =>
      groupVariantBreakdowns(box.lines || [], {
        getBreakdown: (line: any) =>
          Array.isArray(line.qtyBreakdown) ? line.qtyBreakdown : [],
        getVariant: (line: any) => resolveVariantSourceFromLine(line),
        getItemKey: (line: any) => line.id,
      }),
    [box.lines]
  );

  const handleSearch = () => {
    const payload = buildFindPayload(findForm.getValues() as any);
    submit(payload, { method: "post" });
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
        <Group gap="md" align="center">
          <Title order={2}>{box.code || `Box #${box.id}`}</Title>
          <Badge size="lg" color={box.state === "shipped" ? "green" : "blue"}>
            {box.state}
          </Badge>
        </Group>
        <FindToggle
          beforeEnterFind={() => enterFind()}
          onSearch={handleSearch}
        />
      </Group>
      <BoxDetailForm mode={mode as any} form={activeForm} />
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
                  <Table.Td>
                    {(line.qtyBreakdown || []).length
                      ? (line.qtyBreakdown as number[]).join(", ")
                      : "—"}
                  </Table.Td>
                  <Table.Td>{line.notes || ""}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          {lineBreakdownGroups.length > 0 && (
            <VariantBreakdownSection
              groups={lineBreakdownGroups}
              renderLineLabel={(line: any) => (
                <Stack gap={0}>
                  <Text size="sm">
                    {line.product?.sku ?? line.productId ?? `Line ${line.id}`}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {line.job?.name || (line.jobId ? `Job ${line.jobId}` : "")}
                  </Text>
                </Stack>
              )}
            />
          )}
        </Stack>
      </Card>
    </Stack>
  );
}
