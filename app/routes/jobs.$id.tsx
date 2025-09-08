import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Link, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import { useRecordBrowser, useMasterTable, RecordNavButtons, BreadcrumbSet, useInitGlobalFormContext, useRecordBrowserShortcuts } from "@aa/timber";
import { Stack, Title, Group, Table, Text, Card, Divider, Tooltip, Grid, TextInput, Select, Button } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { Controller, useForm } from "react-hook-form";
import type { ReactNode } from "react";
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

  // Use extension-enabled assemblies to include computed fields
  const assemblies = await prisma.assembly.findMany({
    where: { jobId: id },
    orderBy: { id: "asc" },
  });

  const productIds = Array.from(new Set((job.assemblies || []).map((a: any) => a.productId).filter(Boolean))) as number[];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          name: true,
          variantSet: { select: { name: true, id: true, variants: true } },
        },
      })
    : [];
  const productsById: Record<number, any> = Object.fromEntries(products.map((p: any) => [p.id, p]));

  const companies = await prisma.company.findMany({ where: { isCustomer: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 });
  return json({ job, assemblies, productsById, companies });
}

function buildTooltipLabel(a: any, p: any): ReactNode {
  const raw: string[] = (p?.variantSet?.variants || []) as string[];
  let last = -1;
  for (let i = raw.length - 1; i >= 0; i--) {
    const s = (raw[i] || "").toString().trim();
    if (s) {
      last = i;
      break;
    }
  }
  const cnum = (a as any).c_numVariants as number | undefined;
  const effectiveLen = Math.max(0, Math.min(typeof cnum === "number" && cnum > 0 ? cnum : raw.length, last + 1));
  const labels = raw.slice(0, effectiveLen);
  const ord = ((a as any).qtyOrderedBreakdown || []) as number[];
  const cut = ((a as any).c_qtyCut_Breakdown || []) as number[];
  const make = ((a as any).c_qtyMake_Breakdown || []) as number[];
  const pack = ((a as any).c_qtyPack_Breakdown || []) as number[];
  const len = Math.max(labels.length, ord.length, cut.length, make.length, pack.length);
  const cols = labels.length ? labels : Array.from({ length: len }, (_, i) => `#${i + 1}`);
  return (
    <div style={{ padding: 4 }}>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0 6px" }}></th>
            {cols.map((c: string, i: number) => (
              <th key={`h-${i}`} style={{ padding: "0 6px", fontWeight: 600 }}>
                {c || `#${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { name: "Ordered", arr: ord },
            { name: "Cut", arr: cut },
            { name: "Make", arr: make },
            { name: "Pack", arr: pack },
          ].map((row) => (
            <tr key={row.name}>
              <td style={{ padding: "0 6px", fontWeight: 600 }}>{row.name}</td>
              {cols.map((_c: string, i: number) => (
                <td key={`${row.name}-${i}`} style={{ textAlign: "right", padding: "0 6px" }}>
                  {row.arr[i] || ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function JobDetail() {
  const { job, assemblies, productsById, companies } = useLoaderData<typeof loader>();
  const { records: masterRecords } = useMasterTable();
  const recordBrowser = useRecordBrowser(job.id, masterRecords);
  // Register keyboard shortcuts (ArrowLeft/Right, etc.)
  useRecordBrowserShortcuts(job.id);
  const busy = useNavigation().state !== "idle";
  const submit = useSubmit();
  const toYmd = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const form = useForm({
    defaultValues: {
      projectCode: job.projectCode ?? "",
      name: job.name ?? "",
      companyId: job.companyId ? String(job.companyId) : "",
      customerOrderDate: job.customerOrderDate ? new Date(job.customerOrderDate as any) : null,
      targetDate: job.targetDate ? new Date(job.targetDate as any) : null,
      dropDeadDate: job.dropDeadDate ? new Date(job.dropDeadDate as any) : null,
      startDate: job.startDate ? new Date(job.startDate as any) : null,
      endDate: job.endDate ? new Date(job.endDate as any) : null,
      jobType: job.jobType ?? "",
      status: job.status ?? "",
      type: (job as any).type ?? "",
      endCustomerName: job.endCustomerName ?? "",
      customerPoNum: (job as any).customerPoNum ?? "",
    },
  });
  type FormVals = any;
  const save = (values: FormVals) => {
    const fd = new FormData();
    fd.set("_intent", "job.update");
    if (values.projectCode != null) fd.set("projectCode", String(values.projectCode ?? ""));
    if (values.name != null) fd.set("name", String(values.name ?? ""));
    fd.set("companyId", values.companyId ? String(values.companyId) : "");
    fd.set("customerOrderDate", toYmd(values.customerOrderDate));
    fd.set("targetDate", toYmd(values.targetDate));
    fd.set("dropDeadDate", toYmd(values.dropDeadDate));
    fd.set("startDate", toYmd(values.startDate));
    fd.set("endDate", toYmd(values.endDate));
    if (values.jobType != null) fd.set("jobType", String(values.jobType ?? ""));
    if (values.status != null) fd.set("status", String(values.status ?? ""));
    if (values.type != null) fd.set("type", String(values.type ?? ""));
    if (values.endCustomerName != null) fd.set("endCustomerName", String(values.endCustomerName ?? ""));
    if (values.customerPoNum != null) fd.set("customerPoNum", String(values.customerPoNum ?? ""));
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext(form as any, save, () => form.reset());

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
          ]}
        />
        {recordBrowser && <RecordNavButtons recordBrowser={recordBrowser} />}
      </Group>

      <Grid>
        <Grid.Col span={6}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Job</Title>
            </Card.Section>
            <Divider my="xs" />
            <Stack gap="sm">
              <Group gap="md">
                <Text fw={600} w={160}>
                  ID
                </Text>
                <Text>{job.id}</Text>
              </Group>

              <TextInput label="Project Code" w={260} {...form.register("projectCode")} />

              <TextInput label="Name" w={360} {...form.register("name")} />

              <Group gap="md" align="flex-start">
                <Text fw={600} w={160}>
                  Customer
                </Text>
                <Controller
                  name="companyId"
                  control={form.control}
                  render={({ field }) => (
                    <Select
                      data={[{ value: "", label: "(none)" }, ...companies.map((c: any) => ({ value: String(c.id), label: c.name ?? String(c.id) }))]}
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                      searchable
                      w={360}
                    />
                  )}
                />
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={6}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Schedule & Status</Title>
            </Card.Section>
            <Divider my="xs" />
            <Stack gap="sm">
              <Group gap="md">
                <Text fw={600} w={180}>
                  Customer Order Date
                </Text>
                <Controller
                  name="customerOrderDate"
                  control={form.control}
                  render={({ field }) => <DateInput value={field.value} onChange={(v) => field.onChange(v as any)} w={220} clearable placeholder="Pick date" aria-label="Customer Order Date" />}
                />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Target Date
                </Text>
                <Controller
                  name="targetDate"
                  control={form.control}
                  render={({ field }) => <DateInput value={field.value} onChange={(v) => field.onChange(v as any)} w={220} clearable placeholder="Pick date" aria-label="Target Date" />}
                />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Drop Dead Date
                </Text>
                <Controller
                  name="dropDeadDate"
                  control={form.control}
                  render={({ field }) => <DateInput value={field.value} onChange={(v) => field.onChange(v as any)} w={220} clearable placeholder="Pick date" aria-label="Drop Dead Date" />}
                />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Start Date
                </Text>
                <Controller
                  name="startDate"
                  control={form.control}
                  render={({ field }) => <DateInput value={field.value} onChange={(v) => field.onChange(v as any)} w={220} clearable placeholder="Pick date" aria-label="Start Date" />}
                />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  End Date
                </Text>
                <Controller
                  name="endDate"
                  control={form.control}
                  render={({ field }) => <DateInput value={field.value} onChange={(v) => field.onChange(v as any)} w={220} clearable placeholder="Pick date" aria-label="End Date" />}
                />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Job Type
                </Text>
                <TextInput w={220} {...form.register("jobType")} />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Status
                </Text>
                <TextInput w={220} {...form.register("status")} />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Type
                </Text>
                <TextInput w={220} {...form.register("type")} />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  End Customer Name
                </Text>
                <TextInput w={300} {...form.register("endCustomerName")} />
              </Group>
              <Group gap="md">
                <Text fw={600} w={180}>
                  Customer PO #
                </Text>
                <TextInput w={220} {...form.register("customerPoNum")} />
              </Group>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={4}>Assemblies</Title>
            <Button disabled variant="light">
              Add Assembly
            </Button>
          </Group>
        </Card.Section>
        <Divider my="xs" />
        <Table striped withTableBorder withColumnBorders highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>ID</Table.Th>
              <Table.Th>Product SKU</Table.Th>
              <Table.Th>Product Name</Table.Th>
              <Table.Th>Variant Set</Table.Th>
              <Table.Th>Ord</Table.Th>
              <Table.Th>Cut</Table.Th>
              <Table.Th>Make</Table.Th>
              <Table.Th>Pack</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(assemblies || []).map((a: any) => {
              const p = a.productId ? (productsById as any)[a.productId] : null;
              const labelNode = buildTooltipLabel(a, p);
              return (
                <Table.Tr key={a.id}>
                  <Table.Td>
                    <Link to={`/jobs/${job.id}/assembly/${a.id}`}>{a.id}</Link>
                  </Table.Td>
                  <Table.Td>{p?.sku || ""}</Table.Td>
                  <Table.Td>{p?.name || ""}</Table.Td>
                  <Table.Td>{p?.variantSet?.name || ""}</Table.Td>
                  <Table.Td>
                    <Tooltip openDelay={300} label={labelNode}>
                      <Text>{(a as any).c_qtyOrdered ?? 0}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip openDelay={300} label={labelNode}>
                      <Text>{(a as any).c_qtyCut ?? 0}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip openDelay={300} label={labelNode}>
                      <Text>{(a as any).c_qtyMake ?? 0}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip openDelay={300} label={labelNode}>
                      <Text>{(a as any).c_qtyPack ?? 0}</Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>{(a as any).status || ""}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent !== "job.update") return redirect(`/jobs/${id}`);

  const parseDate = (v: FormDataEntryValue | null) => {
    const s = (v as string) || "";
    if (!s.trim()) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  };

  const data: any = {
    projectCode: (form.get("projectCode") as string) || null,
    name: (form.get("name") as string) || null,
    endCustomerName: (form.get("endCustomerName") as string) || null,
    jobType: (form.get("jobType") as string) || null,
    status: (form.get("status") as string) || null,
    customerPoNum: (form.get("customerPoNum") as string) || null,
    startDate: parseDate(form.get("startDate")) as Date | null,
    endDate: parseDate(form.get("endDate")) as Date | null,
    customerOrderDate: parseDate(form.get("customerOrderDate")) as Date | null,
    targetDate: parseDate(form.get("targetDate")) as Date | null,
    dropDeadDate: parseDate(form.get("dropDeadDate")) as Date | null,
  };

  const companyIdStr = (form.get("companyId") as string) || "";
  data.companyId = companyIdStr ? Number(companyIdStr) : null;

  await prisma.job.update({ where: { id }, data });
  return redirect(`/jobs/${id}`);
}
