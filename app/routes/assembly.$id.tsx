import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Button,
  Group,
  Stack,
  Table,
  Title,
  Text,
  Card,
  Divider,
  Grid,
} from "@mantine/core";
import { Controller, useForm } from "react-hook-form";
import { prisma } from "../utils/prisma.server";
import {
  BreadcrumbSet,
  useRecordBrowser,
  RecordNavButtons,
  useRecordBrowserShortcuts,
} from "packages/timber";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const assembly = await prisma.assembly.findUnique({
    where: { id },
    include: { job: true, variantSet: true },
  });
  if (!assembly) throw new Response("Not Found", { status: 404 });
  // fetch product's variant set if assembly lacks one
  let productVariantSet: {
    id: number;
    name: string | null;
    variants: string[];
  } | null = null;
  if (!assembly.variantSetId && assembly.productId) {
    const p = await prisma.product.findUnique({
      where: { id: assembly.productId },
      select: {
        variantSet: { select: { id: true, name: true, variants: true } },
      },
    });
    productVariantSet = (p?.variantSet as any) || null;
  }
  const costings = await prisma.costing.findMany({
    where: { assemblyId: id },
    include: { component: { select: { id: true, sku: true, name: true } } },
  });
  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId: id },
    include: { job: true },
  });
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { id: "asc" },
  });
  return json({ assembly, costings, activities, products, productVariantSet });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const idRaw = params.id;
  const id = idRaw && !Number.isNaN(Number(idRaw)) ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return redirect("/assembly");
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent === "assembly.update") {
    const name = (form.get("name") as string) || null;
    const status = (form.get("status") as string) || null;
    await prisma.assembly.update({ where: { id }, data: { name, status } });
    return redirect(`/assembly/${id}`);
  }

  if (intent === "costing.create") {
    const compRaw = form.get("componentId");
    const compNum = compRaw == null || compRaw === "" ? null : Number(compRaw);
    const componentId = Number.isFinite(compNum as any)
      ? (compNum as number)
      : null;
    const quantityPerUnit = form.get("quantityPerUnit")
      ? Number(form.get("quantityPerUnit"))
      : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const usageType = (form.get("usageType") as string) || null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: {
        assemblyId: id,
        componentId: componentId ?? undefined,
        quantityPerUnit,
        unitCost,
        usageType: usageType as any,
        notes,
      },
    });
    return redirect(`/assembly/${id}`);
  }

  if (intent === "costing.delete") {
    const cid = Number(form.get("id"));
    if (cid) await prisma.costing.delete({ where: { id: cid } });
    return redirect(`/assembly/${id}`);
  }

  if (intent === "activity.delete") {
    const aid = Number(form.get("id"));
    if (aid) await prisma.assemblyActivity.delete({ where: { id: aid } });
    return redirect(`/assembly/${id}`);
  }

  return redirect(`/assembly/${id}`);
}

export default function AssemblyDetailRoute() {
  const { assembly, costings, activities, products, productVariantSet } =
    useLoaderData<typeof loader>();
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  useRecordBrowserShortcuts(assembly.id);

  const costingForm = useForm<{
    componentId: number | null;
    quantityPerUnit: number | null;
    unitCost: number | null;
    usageType: string | null;
    notes: string | null;
  }>({
    defaultValues: {
      componentId: null,
      quantityPerUnit: null,
      unitCost: null,
      usageType: null,
      notes: "",
    },
  });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>Assembly</Title>
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Assembly", href: "/assembly" },
            { label: String(assembly.id), href: `/assembly/${assembly.id}` },
          ]}
        />
      </Group>
      <RecordNavButtons recordBrowser={useRecordBrowser(assembly.id)} />
      <Grid>
        <Grid.Col span={5}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Assembly</Title>
            </Card.Section>
            <Divider my="xs" />
            <Stack gap={6}>
              <Group gap="md">
                <Text fw={600} w={140}>
                  ID
                </Text>
                <Text>{assembly.id}</Text>
              </Group>
              <Group gap="md">
                <Text fw={600} w={140}>
                  Name
                </Text>
                <Text>{assembly.name || ""}</Text>
              </Group>
              <Group gap="md">
                <Text fw={600} w={140}>
                  Job
                </Text>
                <Text>{assembly.job?.name || assembly.jobId || ""}</Text>
              </Group>
              <Group gap="md">
                <Text fw={600} w={140}>
                  Status
                </Text>
                <Text>{assembly.status || ""}</Text>
              </Group>
            </Stack>
          </Card>
        </Grid.Col>

        <Grid.Col span={7}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Quantities</Title>
            </Card.Section>
            <Divider my="xs" />
            {(() => {
              const rawLabels =
                (assembly.variantSet?.variants?.length
                  ? assembly.variantSet.variants
                  : productVariantSet?.variants) || [];
              // determine last non-empty label index
              let last = -1;
              for (let i = rawLabels.length - 1; i >= 0; i--) {
                const s = (rawLabels[i] || "").toString().trim();
                if (s) {
                  last = i;
                  break;
                }
              }
              const cnum = (assembly as any).c_numVariants as
                | number
                | undefined;
              const effectiveLen = Math.max(
                0,
                Math.min(
                  typeof cnum === "number" && cnum > 0
                    ? cnum
                    : rawLabels.length,
                  last + 1
                )
              );
              const labels = rawLabels.slice(0, effectiveLen);
              const ordered = ((assembly as any).qtyOrderedBreakdown ||
                []) as number[];
              const cut = ((assembly as any).c_qtyCut_Breakdown ||
                []) as number[];
              const mk = ((assembly as any).c_qtyMake_Breakdown ||
                []) as number[];
              const pk = ((assembly as any).c_qtyPack_Breakdown ||
                []) as number[];
              const len = Math.max(
                labels.length,
                ordered.length,
                cut.length,
                mk.length,
                pk.length
              );
              const cols = labels.length
                ? labels
                : Array.from({ length: len }, (_, i) => `#${i + 1}`);
              const sum = (arr: number[]) =>
                (arr || []).reduce(
                  (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
                  0
                );
              return (
                <Table withTableBorder withColumnBorders striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Type</Table.Th>
                      {cols.map((l: string, i: number) => (
                        <Table.Th key={`qcol-${i}`}>
                          {l || `#${i + 1}`}
                        </Table.Th>
                      ))}
                      <Table.Th>Total</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>Ordered</Table.Td>
                      {cols.map((_l, i) => (
                        <Table.Td key={`ord-${i}`}>
                          {ordered[i] ? ordered[i] : ""}
                        </Table.Td>
                      ))}
                      <Table.Td>{sum(ordered)}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Cut</Table.Td>
                      {cols.map((_l, i) => (
                        <Table.Td key={`cut-${i}`}>
                          {cut[i] ? cut[i] : ""}
                        </Table.Td>
                      ))}
                      <Table.Td>{(assembly as any).c_qtyCut ?? 0}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Make</Table.Td>
                      {cols.map((_l, i) => (
                        <Table.Td key={`make-${i}`}>
                          {mk[i] ? mk[i] : ""}
                        </Table.Td>
                      ))}
                      <Table.Td>{(assembly as any).c_qtyMake ?? 0}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Pack</Table.Td>
                      {cols.map((_l, i) => (
                        <Table.Td key={`pack-${i}`}>
                          {pk[i] ? pk[i] : ""}
                        </Table.Td>
                      ))}
                      <Table.Td>{(assembly as any).c_qtyPack ?? 0}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>
              );
            })()}
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Group justify="space-between" align="center">
                <Title order={4}>Costings</Title>
                <Button
                  variant="default"
                  disabled
                  title="Inline add coming later"
                >
                  Add Costing
                </Button>
              </Group>
            </Card.Section>
            <Divider my="xs" />
            <Table striped withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Component</Table.Th>
                  <Table.Th>Usage</Table.Th>
                  <Table.Th>Qty/Unit</Table.Th>
                  <Table.Th>Unit Cost</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {costings.map((c: any) => (
                  <Table.Tr key={c.id}>
                    <Table.Td>{c.id}</Table.Td>
                    <Table.Td>
                      {c.component?.name || c.component?.sku || c.componentId}
                    </Table.Td>
                    <Table.Td>{c.usageType}</Table.Td>
                    <Table.Td>{c.quantityPerUnit}</Table.Td>
                    <Table.Td>{c.unitCost}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>

        <Grid.Col span={12}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Activity History</Title>
            </Card.Section>
            <Divider my="xs" />
            <Table striped withTableBorder withColumnBorders highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>ID</Table.Th>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Start</Table.Th>
                  <Table.Th>End</Table.Th>
                  <Table.Th>Status</Table.Th>
                  {(() => {
                    const raw =
                      (assembly.variantSet?.variants?.length
                        ? assembly.variantSet.variants
                        : productVariantSet?.variants) || [];
                    // respect non-empty labels and c_numVariants if present
                    let last = -1;
                    for (let i = raw.length - 1; i >= 0; i--) {
                      const s = (raw[i] || "").toString().trim();
                      if (s) {
                        last = i;
                        break;
                      }
                    }
                    const cnum = (assembly as any).c_numVariants as
                      | number
                      | undefined;
                    const effectiveLen = Math.max(
                      0,
                      Math.min(
                        typeof cnum === "number" && cnum > 0
                          ? cnum
                          : raw.length,
                        last + 1
                      )
                    );
                    const cols = raw.slice(0, effectiveLen);
                    return (
                      cols.length
                        ? cols
                        : (
                            activities.find((a: any) =>
                              Array.isArray(a.qtyBreakdown)
                            )?.qtyBreakdown || []
                          ).map((_x: any, i: number) => `#${i + 1}`)
                    ).map((label: string, idx: number) => (
                      <Table.Th key={`vcol-${idx}`}>
                        {label || `#${idx + 1}`}
                      </Table.Th>
                    ));
                  })()}
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {activities.map((a: any) => {
                  const raw =
                    (assembly.variantSet?.variants?.length
                      ? assembly.variantSet.variants
                      : productVariantSet?.variants) || [];
                  let last = -1;
                  for (let i = raw.length - 1; i >= 0; i--) {
                    const s = (raw[i] || "").toString().trim();
                    if (s) {
                      last = i;
                      break;
                    }
                  }
                  const cnum = (assembly as any).c_numVariants as
                    | number
                    | undefined;
                  const effectiveLen = Math.max(
                    0,
                    Math.min(
                      typeof cnum === "number" && cnum > 0 ? cnum : raw.length,
                      last + 1
                    )
                  );
                  const labels = raw.slice(0, effectiveLen);
                  const breakdown = (a.qtyBreakdown || []) as number[];
                  const cols = labels.length
                    ? labels
                    : breakdown.map((_x, i) => `#${i + 1}`);
                  return (
                    <Table.Tr key={a.id}>
                      <Table.Td>{a.id}</Table.Td>
                      <Table.Td>{a.name}</Table.Td>
                      <Table.Td>{a.description}</Table.Td>
                      <Table.Td>{a.job?.name || a.jobId}</Table.Td>
                      <Table.Td>
                        {a.startTime
                          ? new Date(a.startTime).toLocaleString()
                          : ""}
                      </Table.Td>
                      <Table.Td>
                        {a.endTime ? new Date(a.endTime).toLocaleString() : ""}
                      </Table.Td>
                      <Table.Td>{a.status}</Table.Td>
                      {cols.map((_label: string, idx: number) => (
                        <Table.Td key={`${a.id}-qty-${idx}`}>
                          {breakdown[idx] ? breakdown[idx] : ""}
                        </Table.Td>
                      ))}
                      <Table.Td>{a.notes}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
