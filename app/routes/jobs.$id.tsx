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
  Form,
  useSearchParams,
  useNavigate,
} from "@remix-run/react";
import {
  Stack,
  Title,
  Group,
  Table,
  Text,
  Card,
  SimpleGrid,
  Grid,
  Divider,
  Button,
  Modal,
  TextInput,
  Switch,
  Badge,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates"; // still used elsewhere if any
import { useEffect, useMemo, useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { BreadcrumbSet } from "@aa/timber";
import { useInitGlobalFormContext } from "@aa/timber";
// useJobFindify removed (modal-based find standard)
import { prisma } from "../utils/prisma.server";
// Legacy jobSearchSchema/buildWhere replaced by config-driven builder
import { buildWhereFromConfig } from "../utils/buildWhereFromConfig.server";
import { getVariantLabels } from "../utils/getVariantLabels";
import React from "react";
import { useFind } from "../find/FindContext";
import { useRecordContext } from "../record/RecordContext";
import { JobDetailForm } from "../components/JobDetailForm";
import * as jobDetail from "../formConfigs/jobDetail";
import { JobFindManager } from "../components/JobFindManager";

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
  if (intent === "find") {
    const raw: Record<string, any> = {};
    for (const [k, v] of form.entries()) {
      if (k.startsWith("_")) continue;
      if (k === "find") continue;
      raw[k] = v === "" ? null : v;
    }
    // Build where from config fields that have findOp metadata
    const searchFields: any[] = [
      ...((jobDetail as any).jobOverviewFields || []),
      ...((jobDetail as any).jobDateStatusLeft || []),
      ...((jobDetail as any).jobDateStatusRight || []),
    ];
    // buildWhereFromConfig(values, configs)
    const where = buildWhereFromConfig(raw as any, searchFields as any);
    const first = await prisma.job.findFirst({
      where,
      select: { id: true },
      orderBy: { id: "asc" },
    });
    const sp = new URLSearchParams();
    sp.set("find", "1");
    const returnParam = form.get("return");
    if (returnParam) sp.set("return", String(returnParam));
    const push = (k: string, v: any) => {
      if (v === undefined || v === null || v === "") return;
      sp.set(k, String(v));
    };
    push("id", raw.id);
    push("projectCode", raw.projectCode);
    push("name", raw.name);
    push("status", raw.status);
    push("jobType", raw.jobType);
    push("endCustomerName", raw.endCustomerName);
    push("companyId", raw.companyId);
    const qs = sp.toString();
    if (first?.id != null) return redirect(`/jobs/${first.id}?${qs}`);
    return redirect(`/jobs?${qs}`);
  }
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
    console.log("[jobs.$id] job.update", { id, data });
    await prisma.job.update({ where: { id }, data });
    console.log("[jobs.$id] updated");
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
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(job.id);
  }, [job.id, setCurrentId]);
  const nav = useNavigation();
  const submit = useSubmit();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const busy = nav.state !== "idle";
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [qtyModalOpen, setQtyModalOpen] = useState(false);
  const [qtyAsm, setQtyAsm] = useState<any>(null);
  const [qtyLabels, setQtyLabels] = useState<string[]>([]);
  const [orderedArr, setOrderedArr] = useState<number[]>([]);
  // Cut modal state
  const [cutModalOpen, setCutModalOpen] = useState(false);
  const [cutAsm, setCutAsm] = useState<any>(null);
  const [cutArr, setCutArr] = useState<number[]>([]);
  // Master table removed; navigation handled via RecordContext
  // Local edit form only
  const jobForm = useForm<any>({
    defaultValues: {
      id: job.id,
      projectCode: job.projectCode || "",
      name: job.name || "",
      status: job.status || "",
      jobType: job.jobType || "",
      endCustomerName: job.endCustomerName || "",
      companyId: job.companyId ?? job.company?.id ?? undefined,
      customerOrderDate: job.customerOrderDate?.slice?.(0, 10) || "",
      targetDate: job.targetDate?.slice?.(0, 10) || "",
      dropDeadDate: job.dropDeadDate?.slice?.(0, 10) || "",
      cutSubmissionDate: job.cutSubmissionDate?.slice?.(0, 10) || "",
    },
  });
  const originalDefaults = useMemo(() => jobForm.getValues(), []);
  const { registerFindCallback } = useFind();
  const save = (values: any) => {
    const fd = new FormData();
    fd.set("_intent", "job.update");
    const simple = [
      "projectCode",
      "name",
      "status",
      "jobType",
      "endCustomerName",
    ];
    simple.forEach((k) => {
      if (values[k] != null) fd.set(k, values[k]);
    });
    if (values.companyId != null && values.companyId !== "")
      fd.set("companyId", String(values.companyId));
    [
      "customerOrderDate",
      "targetDate",
      "dropDeadDate",
      "cutSubmissionDate",
    ].forEach((df) => {
      if (values[df]) fd.set(df, values[df]);
    });
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext(jobForm as any, save, () => {
    jobForm.reset(originalDefaults, { keepDefaultValues: true });
    console.log("[jobs.$id] discard changes -> form reset to original", {
      id: job.id,
    });
  });

  // Dirty state transition logging
  useEffect(() => {
    const sub = jobForm.watch((_val, info) => {
      // no-op; watch ensures formState updates promptly
    });
    return () => sub.unsubscribe();
  }, [jobForm]);

  const dirtyRef = React.useRef(jobForm.formState.isDirty);
  console.log("!! [jobs.$id] dirty state", {
    id: job.id,
    was: dirtyRef.current,
    now: jobForm.formState.isDirty,
    changed: Object.keys(jobForm.formState.dirtyFields || {}),
  });
  useEffect(() => {
    if (jobForm.formState.isDirty !== dirtyRef.current) {
      console.log("[jobs.$id] dirty state", {
        id: job.id,
        was: dirtyRef.current,
        now: jobForm.formState.isDirty,
        changed: Object.keys(jobForm.formState.dirtyFields || {}),
      });
      dirtyRef.current = jobForm.formState.isDirty;
    }
  }, [jobForm.formState.isDirty, jobForm.formState.dirtyFields, job.id]);

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
    const cols = getVariantLabels(labels, qtyAsm.c_numVariants as any);
    setQtyLabels(cols);
    const orderedRaw: number[] = Array.isArray(qtyAsm.qtyOrderedBreakdown)
      ? qtyAsm.qtyOrderedBreakdown
      : [];
    const initial = Array.from(
      { length: cols.length },
      (_, i) => orderedRaw[i] || 0
    );
    setOrderedArr(initial);
  }, [qtyAsm]);

  // Prev/Next keyboard hotkeys handled globally in RecordProvider

  // Find modal handled via JobFindManager now

  // returnUrl no longer used (find handled externally)
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: String(job.id), href: `/jobs/${job.id}` },
          ]}
        />
        <Group gap="xs"></Group>
      </Group>

      <div>
        <JobDetailForm
          mode="edit"
          form={jobForm as any}
          job={job}
          openCustomerModal={() => setCustomerModalOpen(true)}
        />
      </div>

      <JobFindManager jobSample={job} />

      {true && (
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
                const p = a.productId
                  ? (productsById as any)[a.productId]
                  : null;
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
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => {
                          const labels = (p?.variantSet?.variants ||
                            []) as string[];
                          // use existing variant logic for lengths
                          const cols = getVariantLabels(
                            labels,
                            p?.variantSet?.variants?.length as any
                          );
                          const current = Array.isArray(a.qtyCutBreakdown)
                            ? a.qtyCutBreakdown
                            : [];
                          const initial = Array.from(
                            { length: cols.length },
                            (_, i) => current[i] || 0
                          );
                          setCutAsm({ ...a, labels: cols });
                          setCutArr(initial);
                          setCutModalOpen(true);
                        }}
                      >
                        {(a as any).c_qtyCut ?? 0}
                      </Button>
                    </Table.Td>
                    <Table.Td>{(a as any).c_qtyMake ?? ""}</Table.Td>
                    <Table.Td>{(a as any).c_qtyPack ?? ""}</Table.Td>
                    <Table.Td>{a.status || ""}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Card>
      )}

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
                  jobForm.setValue("companyId", c.id as any);
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
                  <Text w={60}>{p.id}</Text>
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

      {/* Edit Cut Breakdown Modal */}
      <Modal
        opened={cutModalOpen}
        onClose={() => {
          setCutModalOpen(false);
          setCutAsm(null);
        }}
        title="Edit Cut Quantities"
        size="auto"
        centered
      >
        {cutAsm && (
          <form
            method="post"
            onSubmit={() => {
              setCutModalOpen(false);
            }}
          >
            <input
              type="hidden"
              name="_intent"
              value="assembly.updateCutBreakdown"
            />
            <input type="hidden" name="assemblyId" value={cutAsm.id} />
            <input type="hidden" name="cutArr" value={JSON.stringify(cutArr)} />
            <Table withTableBorder withColumnBorders striped>
              <Table.Thead>
                <Table.Tr>
                  {Array.from({ length: cutArr.length }, (_, i) => (
                    <Table.Th key={`ch-${i}`} ta="center">
                      {cutAsm.labels?.[i] || `#${i + 1}`}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  {Array.from({ length: cutArr.length }, (_, i) => (
                    <Table.Td key={`cc-${i}`}>
                      <TextInput
                        w="60px"
                        styles={{ input: { textAlign: "center" } }}
                        type="number"
                        value={cutArr[i]}
                        onChange={(e) => {
                          const v =
                            e.currentTarget.value === ""
                              ? 0
                              : Number(e.currentTarget.value);
                          setCutArr((prev) =>
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
