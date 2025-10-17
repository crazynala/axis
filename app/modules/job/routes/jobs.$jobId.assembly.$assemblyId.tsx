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
  Modal,
  TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { prisma, prismaBase } from "../../../utils/prisma.server";
import { BreadcrumbSet, getLogger } from "@aa/timber";
import { useRecordContext } from "../../../base/record/RecordContext";
import { AssemblyActivityModal } from "../../../components/AssemblyActivityModal";
import { ExternalLink } from "../../../components/ExternalLink";
import { createCutActivity } from "../../../utils/activity.server";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig } from "~/base/state/configs";
import { AssemblyQuantitiesCard } from "~/modules/job/components/AssemblyQuantitiesCard";
import { AssemblyCostingsTable } from "~/modules/job/components/AssemblyCostingsTable";

export const meta: MetaFunction = () => [{ title: "Job Assembly" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const assemblyId = Number(params.assemblyId);

  const assembly = await prisma.assembly.findUnique({
    where: { id: assemblyId },
    include: {
      job: {
        include: {
          locationIn: { select: { id: true, name: true } },
          company: { select: { id: true, priceMultiplier: true } },
        },
      },
      variantSet: true,
    },
  });
  if (!assembly || assembly.jobId !== jobId)
    throw new Response("Not Found", { status: 404 });
  // If assembly is in a group, redirect to the group page canonically
  if ((assembly as any).assemblyGroupId) {
    return redirect(
      `/jobs/${jobId}/group/${(assembly as any).assemblyGroupId}`
    );
  }
  let productVariantSet: {
    id: number;
    name: string | null;
    variants: string[];
  } | null = null;

  console.log("Assembly loader", assembly);
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
    where: { assemblyId },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          salePriceGroup: { select: { id: true, saleRanges: true } },
          salePriceRanges: true,
        },
      },
      salePriceGroup: { select: { id: true, saleRanges: true } },
    },
  });
  const activities = await prisma.assemblyActivity.findMany({
    where: { assemblyId },
    include: { job: true },
  });
  const products = await prismaBase.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { id: "asc" },
  });
  // Compute per-costing stocks (location and global) and used qty
  const jobLocId = assembly.job?.locationIn?.id ?? null;
  const compIds = Array.from(
    new Set(
      costings
        .map((c) => c.product?.id || (c as any).productId || null)
        .filter((x): x is number => Number.isFinite(Number(x)))
        .map((x) => Number(x))
    )
  );
  const compInfos = new Map<number, { allStock: number; locStock: number }>();
  for (const pid of compIds) {
    const p = await prisma.product.findUnique({ where: { id: pid } });
    const allStock = Number((p as any)?.c_stockQty ?? 0);
    const locStock = Number(
      ((p as any)?.c_byLocation || []).find(
        (r: any) => (r.location_id ?? null) === jobLocId
      )?.qty ?? 0
    );
    compInfos.set(pid, { allStock, locStock });
  }
  // Used by costing across this assembly's movements
  const usedRows = (await prismaBase.$queryRaw`
    SELECT pm."assemblyActivityId" AS aid, pml."costingId" AS cid,
           COALESCE(SUM(ABS(pml.quantity)),0)::float AS used
    FROM "ProductMovementLine" pml
    JOIN "ProductMovement" pm ON pm.id = pml."movementId"
    WHERE pm."assemblyId" = ${assemblyId}
    GROUP BY pm."assemblyActivityId", pml."costingId"
  `) as Array<{ aid: number | null; cid: number | null; used: number }>;
  const usedByCosting = new Map<number, number>();
  for (const r of usedRows) {
    if (r.cid != null) {
      usedByCosting.set(
        r.cid,
        (usedByCosting.get(r.cid) || 0) + Number(r.used || 0)
      );
    }
  }
  // Build activity consumption map for editing (by activity -> costing -> batch)
  const consRows = (await prismaBase.$queryRaw`
    SELECT pm."assemblyActivityId" AS aid, pml."costingId" AS cid, pml."batchId" AS bid,
           COALESCE(SUM(ABS(pml.quantity)),0)::float AS qty
    FROM "ProductMovementLine" pml
    JOIN "ProductMovement" pm ON pm.id = pml."movementId"
    WHERE pm."assemblyId" = ${assemblyId}
    GROUP BY pm."assemblyActivityId", pml."costingId", pml."batchId"
  `) as Array<{
    aid: number | null;
    cid: number | null;
    bid: number | null;
    qty: number;
  }>;
  const activityConsumptionMap: Record<
    number,
    Record<number, Record<number, number>>
  > = {};
  for (const r of consRows) {
    const aid = r.aid ?? 0;
    const cid = r.cid ?? 0;
    const bid = r.bid ?? 0;
    if (!aid || !cid || !bid) continue;
    activityConsumptionMap[aid] = activityConsumptionMap[aid] || {};
    activityConsumptionMap[aid][cid] = activityConsumptionMap[aid][cid] || {};
    activityConsumptionMap[aid][cid][bid] = Number(r.qty || 0);
  }
  // Collect stats keyed by costing id
  const costingStats: Record<
    number,
    { allStock: number; locStock: number; used: number }
  > = {};
  for (const c of costings) {
    const pid = c.product?.id || (c as any).productId || null;
    const info = pid ? compInfos.get(Number(pid)) : undefined;
    costingStats[c.id] = {
      allStock: info?.allStock ?? 0,
      locStock: info?.locStock ?? 0,
      used: usedByCosting.get(c.id) ?? 0,
    };
  }
  return json({
    assembly,
    costings,
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const jobId = Number(params.jobId);
  const assemblyId = Number(params.assemblyId);
  if (!jobId || !assemblyId) return redirect(`/jobs/${jobId}`);
  const form = await request.formData();
  const intent = form.get("_intent");
  if (intent === "assembly.update") {
    const name = (form.get("name") as string) || null;
    const status = (form.get("status") as string) || null;
    await prisma.assembly.update({
      where: { id: assemblyId },
      data: { name, status },
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "costing.create") {
    // Accept both productId (new) and componentId (legacy) keys
    const compRaw = form.get("productId") ?? form.get("componentId");
    const compNum = compRaw == null || compRaw === "" ? null : Number(compRaw);
    const productId = Number.isFinite(compNum as any)
      ? (compNum as number)
      : null;
    const quantityPerUnit = form.get("quantityPerUnit")
      ? Number(form.get("quantityPerUnit"))
      : null;
    const unitCost = form.get("unitCost") ? Number(form.get("unitCost")) : null;
    const notes = (form.get("notes") as string) || null;
    await prisma.costing.create({
      data: {
        assemblyId: assemblyId,
        productId: productId ?? undefined,
        quantityPerUnit,
        unitCost,
        notes,
      },
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "costing.delete") {
    const cid = Number(form.get("id"));
    if (cid) await prisma.costing.delete({ where: { id: cid } });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.delete") {
    const aid = Number(form.get("id"));
    if (aid) await prisma.assemblyActivity.delete({ where: { id: aid } });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.create.cut") {
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    const consumptionsStr = String(form.get("consumptions") || "[]");
    let qtyArr: number[] = [];
    let consumptions: any[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    try {
      const c = JSON.parse(consumptionsStr);
      if (Array.isArray(c)) consumptions = c;
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    console.log("[assembly.activity] create.cut", {
      jobId,
      assemblyId,
      activityDate: activityDate.toISOString(),
      qtyBreakdownLen: qtyArr.length,
      consumptionsCount: consumptions.length,
    });
    await createCutActivity({
      assemblyId,
      jobId,
      activityDate,
      qtyBreakdown: qtyArr,
      consumptions,
      notes: null,
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "activity.update") {
    const activityId = Number(form.get("activityId"));
    const qtyArrStr = String(form.get("qtyBreakdown") || "[]");
    const activityDateStr = String(form.get("activityDate") || "");
    const consumptionsStr = String(form.get("consumptions") || "[]");
    let qtyArr: number[] = [];
    let consumptions: any[] = [];
    try {
      const arr = JSON.parse(qtyArrStr);
      if (Array.isArray(arr))
        qtyArr = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    try {
      const c = JSON.parse(consumptionsStr);
      if (Array.isArray(c)) consumptions = c;
    } catch {}
    const activityDate = activityDateStr
      ? new Date(activityDateStr)
      : new Date();
    // Update activity basics
    await prisma.assemblyActivity.update({
      where: { id: activityId },
      data: {
        qtyBreakdown: qtyArr as any,
        quantity: qtyArr.reduce((t, n) => t + (Number(n) || 0), 0),
        activityDate,
      },
    });
    // Remove existing movements for this activity and recreate from submitted consumptions
    const existing = await prisma.productMovement.findMany({
      where: { assemblyActivityId: activityId },
      select: { id: true },
    });
    const existingIds = existing.map((m) => m.id);
    if (existingIds.length) {
      await prisma.productMovementLine.deleteMany({
        where: { movementId: { in: existingIds } },
      });
      await prisma.productMovement.deleteMany({
        where: { id: { in: existingIds } },
      });
    }
    for (const cons of consumptions || []) {
      const rawLines = (cons?.lines || []).filter(
        (l: any) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
      );
      if (!rawLines.length) continue;
      // Resolve header product from costing component
      const costing = await prisma.costing.findUnique({
        where: { id: Number(cons.costingId) },
        select: { productId: true },
      });
      // Enrich with batch product/location and group by location
      const enriched = await Promise.all(
        rawLines.map(async (line: any) => {
          const b = await prisma.batch.findUnique({
            where: { id: Number(line.batchId) },
            select: { productId: true, locationId: true },
          });
          return {
            ...line,
            productId: b?.productId ?? null,
            locationId: b?.locationId ?? null,
          };
        })
      );
      const byLocation = new Map<number | null, any[]>();
      for (const l of enriched) {
        const key = l.locationId ?? null;
        const arr = byLocation.get(key) ?? [];
        arr.push(l);
        byLocation.set(key, arr);
      }
      for (const [locId, lines] of byLocation.entries()) {
        const totalQty = lines.reduce(
          (t, l) => t + Math.abs(Number(l.qty) || 0),
          0
        );
        const headerProductId =
          costing?.productId ??
          lines.find((l) => l.productId != null)?.productId ??
          undefined;
        const movement = await prisma.productMovement.create({
          data: {
            movementType: "Assembly",
            date: activityDate,
            jobId,
            assemblyId,
            assemblyActivityId: activityId,
            costingId: Number(cons.costingId),
            locationOutId: locId ?? undefined,
            productId: headerProductId as number | undefined,
            quantity: totalQty,
            notes: "Cut consumption (edit)",
          },
        });
        for (const line of lines) {
          await prisma.productMovementLine.create({
            data: {
              movementId: movement.id,
              productMovementId: movement.id,
              productId: (line.productId ?? headerProductId) as
                | number
                | undefined,
              batchId: Number(line.batchId),
              costingId: Number(cons.costingId),
              quantity: -Math.abs(Number(line.qty)),
              notes: null,
            },
          });
        }
      }
    }
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  if (intent === "assembly.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "[]");
    let ordered: number[] = [];
    try {
      const arr = JSON.parse(orderedStr);
      if (Array.isArray(arr))
        ordered = arr.map((n: any) =>
          Number.isFinite(Number(n)) ? Number(n) | 0 : 0
        );
    } catch {}
    await prisma.assembly.update({
      where: { id: assemblyId },
      data: { qtyOrderedBreakdown: ordered as any },
    });
    return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
  }
  return redirect(`/jobs/${jobId}/assembly/${assemblyId}`);
}

export default function JobAssemblyRoute() {
  const {
    assembly,
    costings,
    costingStats,
    activityConsumptionMap,
    activities,
    products,
    productVariantSet,
  } = useLoaderData<typeof loader>();
  // Derive job info directly from assembly loaded in this route to avoid fragile routeId coupling
  const job = {
    id: assembly.jobId as number,
    name: assembly.job?.name ?? null,
  };
  const log = getLogger("assembly");
  log.debug({ assemblyId: assembly.id, jobId: job.id }, "Rendering assembly");

  const nav = useNavigation();
  const submit = useSubmit();
  const { setCurrentId, nextId, prevId } = useRecordContext();
  useEffect(() => {
    setCurrentId(assembly.id);
  }, [assembly.id, setCurrentId]);
  // Prev/Next hotkeys handled globally in RecordProvider
  // Path building now automatic (replace last path segment with id); no custom builder needed.
  const [cutOpen, setCutOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<null | any>(null);

  const handleSubmitOrdered = (arr: number[]) => {
    const fd = new FormData();
    fd.set("_intent", "assembly.updateOrderedBreakdown");
    fd.set("orderedArr", JSON.stringify(arr));
    submit(fd, { method: "post" });
  };
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
            {
              label: `Assembly ${assembly.id}`,
              href: `/jobs/${job.id}/assembly/${assembly.id}`,
            },
          ]}
        />
        <Group gap="xs" align="center">
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const p = prevId(assembly.id as any);
              if (p != null)
                window.location.href = `/jobs/${job.id}/assembly/${p}`;
            }}
          >
            Prev
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              const n = nextId(assembly.id as any);
              if (n != null)
                window.location.href = `/jobs/${job.id}/assembly/${n}`;
            }}
          >
            Next
          </Button>
          <StateChangeButton
            value={(assembly as any).status || "DRAFT"}
            defaultValue={(assembly as any).status || "DRAFT"}
            onChange={(v) => {
              const fd = new FormData();
              fd.set("_intent", "assembly.update");
              if ((assembly as any).name)
                fd.set("name", String((assembly as any).name));
              fd.set("status", v);
              submit(fd, { method: "post" });
            }}
            config={assemblyStateConfig}
          />
          <Button variant="light" size="xs" onClick={() => setCutOpen(true)}>
            Record Cut
          </Button>
        </Group>
      </Group>
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
                <Text>{job.name || job.id}</Text>
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
          <AssemblyQuantitiesCard
            title="Quantities"
            variants={{
              labels:
                (assembly.variantSet?.variants?.length
                  ? assembly.variantSet.variants
                  : productVariantSet?.variants) || [],
              numVariants: Number((assembly as any).c_numVariants || 0) || 0,
            }}
            items={[
              {
                label: `Assembly ${assembly.id}`,
                ordered: ((assembly as any).qtyOrderedBreakdown ||
                  []) as number[],
                cut: ((assembly as any).c_qtyCut_Breakdown || []) as number[],
                make: ((assembly as any).c_qtyMake_Breakdown || []) as number[],
                pack: ((assembly as any).c_qtyPack_Breakdown || []) as number[],
                totals: {
                  cut: Number((assembly as any).c_qtyCut || 0),
                  make: Number((assembly as any).c_qtyMake || 0),
                  pack: Number((assembly as any).c_qtyPack || 0),
                },
              },
            ]}
            editableOrdered
            onSubmitOrdered={handleSubmitOrdered}
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <AssemblyCostingsTable
            title="Costings"
            common={costings.map((c: any) => {
              const pid = c.product?.id || (c as any).productId || null;
              const stats = costingStats?.[c.id] || {
                allStock: 0,
                locStock: 0,
                used: 0,
              };
              const required = Math.max(
                0,
                (Number((assembly as any).c_qtyOrdered || 0) -
                  Number((assembly as any).c_qtyCut || 0)) *
                  Number(c.quantityPerUnit || 0)
              );
              // Sale tiers precedence: costing.salePriceGroup > product.salePriceGroup > product.salePriceRanges
              const tiersFromCosting =
                (c?.salePriceGroup?.saleRanges || []).map((r: any) => ({
                  minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
                  unitPrice: Number(r.price || r.unitPrice || 0) || 0,
                })) || [];
              const tiersFromProductGroup =
                (c?.product?.salePriceGroup?.saleRanges || []).map(
                  (r: any) => ({
                    minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
                    unitPrice: Number(r.price || r.unitPrice || 0) || 0,
                  })
                ) || [];
              const tiersFromProduct =
                (c?.product?.salePriceRanges || []).map((r: any) => ({
                  minQty: Number(r.rangeFrom || r.minQty || 1) || 1,
                  unitPrice: Number(r.price || r.unitPrice || 0) || 0,
                })) || [];
              const saleTiers = (
                tiersFromCosting.length
                  ? tiersFromCosting
                  : tiersFromProductGroup.length
                  ? tiersFromProductGroup
                  : tiersFromProduct
              ).sort((a: any, b: any) => a.minQty - b.minQty);
              const priceMultiplier =
                Number((assembly.job as any)?.company?.priceMultiplier ?? 1) ||
                1;
              return {
                id: c.id,
                productId: pid,
                sku: c.product?.sku || null,
                name: c.product?.name || null,
                quantityPerUnit: Number(c.quantityPerUnit || 0) || null,
                unitCost: Number(c.unitCost || 0) || null,
                required,
                stats,
                fixedSell:
                  c.salePricePerItem != null
                    ? Number(c.salePricePerItem)
                    : null,
                taxRate: 0,
                saleTiers,
                priceMultiplier,
                manualSalePrice:
                  c.manualSalePrice != null ? Number(c.manualSalePrice) : null,
                marginPct:
                  c.manualMargin != null ? Number(c.manualMargin) : null,
              };
            })}
          />
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
                  <Table.Th>Job</Table.Th>
                  <Table.Th>End</Table.Th>
                  {(() => {
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
                          ).map((_x: any, i: number) => `${i + 1}`)
                    ).map((label: string, idx: number) => (
                      <Table.Th key={`vcol-${idx}`}>
                        {label || `${idx + 1}`}
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
                    : breakdown.map((_x, i) => `${i + 1}`);
                  return (
                    <Table.Tr
                      key={a.id}
                      style={{ cursor: "pointer" }}
                      onClick={() => {
                        setEditActivity(a);
                        setCutOpen(true);
                      }}
                    >
                      <Table.Td>{a.id}</Table.Td>
                      <Table.Td>{a.name}</Table.Td>
                      <Table.Td>{a.job?.name || a.jobId}</Table.Td>
                      <Table.Td>
                        {a.endTime ? new Date(a.endTime).toLocaleString() : ""}
                      </Table.Td>
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
      <AssemblyActivityModal
        opened={cutOpen}
        onClose={() => {
          setCutOpen(false);
          setEditActivity(null);
        }}
        assembly={assembly}
        productVariantSet={productVariantSet as any}
        costings={costings as any}
        activityType={
          editActivity &&
          String(editActivity?.activityType || editActivity?.name || "")
            .toLowerCase()
            .includes("make")
            ? "make"
            : editActivity &&
              String(editActivity?.activityType || editActivity?.name || "")
                .toLowerCase()
                .includes("pack")
            ? "pack"
            : "cut"
        }
        mode={editActivity ? "edit" : "create"}
        activityId={editActivity?.id ?? undefined}
        initialDate={
          editActivity?.activityDate || editActivity?.endTime || null
        }
        initialBreakdown={(editActivity?.qtyBreakdown as any) || null}
        initialConsumption={
          editActivity
            ? activityConsumptionMap?.[editActivity.id] || {}
            : undefined
        }
      />
    </Stack>
  );
}

function AddCostingButton({
  products,
  jobId,
  assemblyId,
}: {
  products: Array<{ id: number; sku: string | null; name: string | null }>;
  jobId: number;
  assemblyId: number;
}) {
  const submit = useSubmit();
  const [opened, setOpened] = useState(false);
  const [q, setQ] = useState("");
  const [quantityPerUnit, setQuantityPerUnit] = useState<string>("");
  const [unitCost, setUnitCost] = useState<string>("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products;
    return products.filter((p) =>
      `${p.sku ?? ""} ${p.name ?? ""}`.toLowerCase().includes(s)
    );
  }, [products, q]);
  return (
    <>
      <Button variant="default" onClick={() => setOpened(true)}>
        Add Costing
      </Button>
      <Modal.Root opened={opened} onClose={() => setOpened(false)} centered>
        <Modal.Overlay />
        <Modal.Content>
          <Modal.Header>
            <Group justify="space-between" w="100%">
              <Title order={5}>Add Costing</Title>
            </Group>
          </Modal.Header>
          <Modal.Body>
            <Stack>
              <TextInput
                placeholder="Search products..."
                value={q}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setQ(e.currentTarget.value)
                }
              />
              <Group grow>
                <TextInput
                  label="Qty / Unit"
                  type="number"
                  value={quantityPerUnit}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setQuantityPerUnit(e.currentTarget.value)
                  }
                />
                <TextInput
                  label="Unit Cost"
                  type="number"
                  value={unitCost}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setUnitCost(e.currentTarget.value)
                  }
                />
              </Group>
              <div style={{ maxHeight: 360, overflow: "auto" }}>
                {filtered.map((p) => (
                  <Group
                    key={p.id}
                    py={6}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("_intent", "costing.create");
                      fd.set("productId", String(p.id));
                      if (quantityPerUnit !== "")
                        fd.set("quantityPerUnit", quantityPerUnit);
                      if (unitCost !== "") fd.set("unitCost", unitCost);
                      submit(fd, { method: "post" });
                      setOpened(false);
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
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
