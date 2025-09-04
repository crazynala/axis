import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Stack,
  Title,
  Group,
  Table,
  Text,
  Card,
  SimpleGrid,
  Divider,
  Button,
  Modal,
  TextInput,
  Switch,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  BreadcrumbSet,
  useRecordBrowser,
  RecordNavButtons,
  useRecordBrowserShortcuts,
} from "packages/timber";
import { useInitGlobalFormContext } from "packages/timber";
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
  const productIds = Array.from(
    new Set((job.assemblies || []).map((a: any) => a.productId).filter(Boolean))
  ) as number[];
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
  const productsById: Record<number, any> = Object.fromEntries(
    products.map((p: any) => [p.id, p])
  );
  const customers = await prisma.company.findMany({
    where: { isCustomer: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 1000,
  });
  const productChoices = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      customerId: true,
      _count: { select: { productLines: true } },
      variantSet: { select: { id: true, variants: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
  });
  return json({ job, productsById, customers, productChoices });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "job.update") {
    const data: any = {};
    const fields = [
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
    ];
    for (const f of fields)
      if (form.has(f)) data[f] = (form.get(f) as string) || null;
    if (form.has("companyId")) {
      const cid = Number(form.get("companyId"));
      data.companyId = Number.isFinite(cid) ? cid : null;
    }
    const dateFields = [
      "customerOrderDate",
      "targetDate",
      "dropDeadDate",
      "cutSubmissionDate",
    ];
    for (const df of dateFields)
      if (form.has(df)) {
        const v = form.get(df) as string;
        data[df] = v ? new Date(v) : null;
      }
    await prisma.job.update({ where: { id }, data });
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.createFromProduct") {
    const productId = Number(form.get("productId"));
    if (Number.isFinite(productId)) {
      const prod = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          name: true,
          variantSetId: true,
          variantSet: { select: { variants: true } },
        },
      });
      if (prod) {
        const vsLen = prod.variantSet?.variants?.length || 0;
        const ordered: number[] =
          vsLen > 0 ? Array.from({ length: vsLen }, () => 0) : [];
        const data: any = {
          name: prod.name || `Assembly ${productId}`,
          productId: prod.id,
          jobId: id,
          qtyOrderedBreakdown: ordered as any,
          status: "new",
        };
        if (prod.variantSetId != null) data.variantSetId = prod.variantSetId;
        await prisma.assembly.create({ data });
      }
    }
    return redirect(`/jobs/${id}`);
  }
  if (intent === "assembly.updateOrderedBreakdown") {
    const assemblyId = Number(form.get("assemblyId"));
    const arrStr = String(form.get("orderedArr") || "");
    try {
      const arr = JSON.parse(arrStr);
      if (Array.isArray(arr)) {
        const ints = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
        await prisma.assembly.update({
          where: { id: assemblyId },
          data: { qtyOrderedBreakdown: ints as any },
        });
      }
    } catch {}
    return redirect(`/jobs/${id}`);
  }
  return redirect(`/jobs/${id}`);
}

export default function JobDetailRoute() {
  const { job, productsById, customers, productChoices } =
    useLoaderData<typeof loader>();
  useRecordBrowserShortcuts(job.id);
  const nav = useNavigation();
  const submit = useSubmit();
  const busy = nav.state !== "idle";
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyAsm, setQtyAsm] = useState<any>(null);
  const [qtyLabels, setQtyLabels] = useState<string[]>([]);
  const [orderedArr, setOrderedArr] = useState<number[]>([]);
  const jobForm = useForm<any>({
    defaultValues: {
      projectCode: (job as any).projectCode || "",
      name: job.name || "",
      companyId: (job as any).companyId || null,
      customerName: (job as any).company?.name || "",
      customerOrderDate: (job as any).customerOrderDate
        ? new Date((job as any).customerOrderDate)
        : null,
      targetDate: (job as any).targetDate
        ? new Date((job as any).targetDate)
        : null,
      dropDeadDate: (job as any).dropDeadDate
        ? new Date((job as any).dropDeadDate)
        : null,
      cutSubmissionDate: (job as any).cutSubmissionDate
        ? new Date((job as any).cutSubmissionDate)
        : null,
      status: job.status || "",
      jobType: (job as any).jobType || "",
      endCustomerName: (job as any).endCustomerName || "",
    },
  });
  type JobFormValues = any;
  const save = (values: JobFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "job.update");
    if (values.projectCode) fd.set("projectCode", values.projectCode);
    if (values.name) fd.set("name", values.name);
    if (values.companyId) fd.set("companyId", String(values.companyId));
    if (values.customerOrderDate)
      fd.set(
        "customerOrderDate",
        new Date(values.customerOrderDate).toISOString().slice(0, 10)
      );
    if (values.targetDate)
      fd.set(
        "targetDate",
        new Date(values.targetDate).toISOString().slice(0, 10)
      );
    if (values.dropDeadDate)
      fd.set(
        "dropDeadDate",
        new Date(values.dropDeadDate).toISOString().slice(0, 10)
      );
    if (values.cutSubmissionDate)
      fd.set(
        "cutSubmissionDate",
        new Date(values.cutSubmissionDate).toISOString().slice(0, 10)
      );
    if (values.status) fd.set("status", values.status);
    if (values.jobType) fd.set("jobType", values.jobType);
    if (values.endCustomerName)
      fd.set("endCustomerName", values.endCustomerName);
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext<JobFormValues>(jobForm as any, save, () =>
    jobForm.reset()
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c: any) =>
      (c.name || "").toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);
  const [productSearch, setProductSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState(false);
  const [assemblyOnly, setAssemblyOnly] = useState(false);
  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return productChoices;
    return productChoices.filter((p: any) =>
      ((p.sku || "") + " " + (p.name || "")).toLowerCase().includes(q)
    );
  }, [productChoices, productSearch]);

  useEffect(() => {
    if (!qtyAsm) return;
    const labels: string[] = Array.isArray(qtyAsm.labels) ? qtyAsm.labels : [];
    // Determine number of variants to show: prefer server-computed c_numVariants when present
    // else derive from last non-empty label; fallback to labels length
    let num = Number.isFinite(qtyAsm.c_numVariants)
      ? (qtyAsm.c_numVariants as number)
      : 0;
    if (!num) {
      let last = -1;
      for (let i = labels.length - 1; i >= 0; i--) {
        if ((labels[i] || "").toString().trim()) {
          last = i;
          break;
        }
      }
      num = last >= 0 ? last + 1 : labels.length;
    }
    const cols = labels.slice(0, num);
    setQtyLabels(cols);
    const arr: number[] = Array.isArray(qtyAsm.qtyOrderedBreakdown)
      ? qtyAsm.qtyOrderedBreakdown
      : [];
    const initial = Array.from({ length: num }, (_, i) => arr[i] || 0);
    setOrderedArr(initial);
  }, [qtyAsm]);
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

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Overview</Title>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={8}>
            <Group gap="md">
              <Text fw={600} w={140}>
                ID
              </Text>
              <Text>{job.id}</Text>
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Project Code
              </Text>
              <TextInput
                {...jobForm.register("projectCode")}
                style={{ flex: 1 }}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={140}>
                Name
              </Text>
              <TextInput {...jobForm.register("name")} style={{ flex: 1 }} />
            </Group>
            <Group gap="md" align="center">
              <Text fw={600} w={140}>
                Customer
              </Text>
              <input type="hidden" value={jobForm.watch("companyId") ?? ""} />
              <TextInput
                readOnly
                value={
                  jobForm.watch("customerName") ||
                  (job as any).company?.name ||
                  ""
                }
                style={{ flex: 1 }}
              />
              <Button
                variant="light"
                onClick={(e) => {
                  e.preventDefault();
                  setCustomerModalOpen(true);
                }}
              >
                Pick
              </Button>
            </Group>
          </Stack>
        </Card>
        <Card withBorder padding="md">
          <Card.Section inheritPadding py="xs">
            <Title order={4}>Dates & Status</Title>
          </Card.Section>
          <Divider my="xs" />
          <Stack gap={8}>
            <Group gap="md">
              <Text fw={600} w={160}>
                Order Date
              </Text>
              <DatePickerInput
                value={jobForm.watch("customerOrderDate")}
                onChange={(v) => jobForm.setValue("customerOrderDate", v)}
                valueFormat="YYYY-MM-DD"
                clearable
                w={200}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Target Date
              </Text>
              <DatePickerInput
                value={jobForm.watch("targetDate")}
                onChange={(v) => jobForm.setValue("targetDate", v)}
                valueFormat="YYYY-MM-DD"
                clearable
                w={200}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Drop Dead
              </Text>
              <DatePickerInput
                value={jobForm.watch("dropDeadDate")}
                onChange={(v) => jobForm.setValue("dropDeadDate", v)}
                valueFormat="YYYY-MM-DD"
                clearable
                w={200}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Submitted
              </Text>
              <DatePickerInput
                value={jobForm.watch("cutSubmissionDate")}
                onChange={(v) => jobForm.setValue("cutSubmissionDate", v)}
                valueFormat="YYYY-MM-DD"
                clearable
                w={200}
              />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Status
              </Text>
              <TextInput {...jobForm.register("status")} />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                Type
              </Text>
              <TextInput {...jobForm.register("jobType")} />
            </Group>
            <Group gap="md">
              <Text fw={600} w={160}>
                End Customer
              </Text>
              <TextInput {...jobForm.register("endCustomerName")} />
            </Group>
          </Stack>
        </Card>
      </SimpleGrid>

      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Group justify="space-between" align="center">
            <Title order={4}>Assemblies</Title>
            <Button variant="light" onClick={() => setProductModalOpen(true)}>
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
              <Table.Th># Ordered</Table.Th>
              <Table.Th>Cut</Table.Th>
              <Table.Th>Make</Table.Th>
              <Table.Th>Pack</Table.Th>
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
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="subtle"
                      onClick={() => {
                        const labels = (p?.variantSet?.variants ||
                          []) as string[];
                        setQtyAsm({ ...a, labels });
                        setQtyModalOpen(true);
                      }}
                    >
                      {(a as any).c_qtyOrdered ?? 0}
                    </Button>
                  </Table.Td>
                  <Table.Td>{(a as any).c_qtyCut ?? ""}</Table.Td>
                  <Table.Td>{(a as any).c_qtyMake ?? ""}</Table.Td>
                  <Table.Td>{(a as any).c_qtyPack ?? ""}</Table.Td>
                  <Table.Td>{a.status || ""}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Card>

      {/* Customer Picker Modal */}
      <Modal.Root
        opened={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        centered
      >
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Stack>
              <Text>Select Customer</Text>
              <TextInput
                placeholder="Search customers..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.currentTarget.value)}
              />
            </Stack>
          </Modal.Header>
          <Modal.Body>
            {filteredCustomers.map((c: any) => (
              <Group
                key={c.id}
                py={6}
                onClick={() => {
                  jobForm.setValue("companyId", c.id);
                  jobForm.setValue("customerName", c.name);
                  setCustomerModalOpen(false);
                }}
                style={{ cursor: "pointer" }}
              >
                <Text>{c.name}</Text>
              </Group>
            ))}
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>

      {/* Product Picker Modal for new Assembly */}
      <Modal
        opened={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title="Add Assembly from Product"
        size="xl"
        centered
      >
        <Stack>
          <Group align="flex-end" justify="space-between">
            <TextInput
              placeholder="Search products..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.currentTarget.value)}
              w={320}
            />
            <Group>
              <Switch
                label="Customer"
                checked={customerFilter}
                onChange={(e) => setCustomerFilter(e.currentTarget.checked)}
              />
              <Switch
                label="Assembly"
                checked={assemblyOnly}
                onChange={(e) => setAssemblyOnly(e.currentTarget.checked)}
              />
            </Group>
          </Group>
          <div style={{ maxHeight: 420, overflow: "auto" }}>
            {filteredProducts
              .filter(
                (p: any) =>
                  !customerFilter ||
                  (jobForm.watch("companyId")
                    ? p.customerId === jobForm.watch("companyId")
                    : true)
              )
              .filter(
                (p: any) => !assemblyOnly || (p._count?.productLines ?? 0) > 0
              )
              .map((p: any) => (
                <Group
                  key={p.id}
                  py={6}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("_intent", "assembly.createFromProduct");
                    fd.set("productId", String(p.id));
                    submit(fd, { method: "post" });
                    setProductModalOpen(false);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <Text w={60}>#{p.id}</Text>
                  <Text w={160}>{p.sku}</Text>
                  <Text style={{ flex: 1 }}>{p.name}</Text>
                </Group>
              ))}
          </div>
        </Stack>
      </Modal>

      {/* Edit Ordered Breakdown Modal */}
      <Modal
        opened={qtyModalOpen}
        onClose={() => {
          setQtyModalOpen(false);
          setQtyAsm(null);
        }}
        title="Edit Ordered Quantities"
        size="auto"
        centered
      >
        {qtyAsm && (
          <form
            method="post"
            onSubmit={() => {
              setQtyModalOpen(false);
            }}
          >
            <input
              type="hidden"
              name="_intent"
              value="assembly.updateOrderedBreakdown"
            />
            <input type="hidden" name="assemblyId" value={qtyAsm.id} />
            <input
              type="hidden"
              name="orderedArr"
              value={JSON.stringify(orderedArr)}
            />
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {Array.from({ length: orderedArr.length }, (_, i) => (
                    <Table.Th key={`h-${i}`} ta="center">
                      {qtyLabels[i] || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {Array.from({ length: orderedArr.length }, (_, i) => (
                    <Table.Td key={`c-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={orderedArr[i]}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setOrderedArr((prev) =>
                            prev.map((x, idx) =>
                              idx === i ? (Number.isFinite(v) ? v | 0 : 0) : x
                            )
                          );
                        }}
                      />
                    </Table.Td>
                  ))}
                </Table.Tr>
              </Table.Tbody>
            </Table>
            <Group justify="end" mt="md">
              <Button type="submit" variant="filled">
                Save
              </Button>
            </Group>
          </form>
        )}
      </Modal>
    </Stack>
  );
}
