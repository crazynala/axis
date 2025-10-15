import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { prisma } from "~/utils/prisma.server";
import {
  Button,
  Card,
  Divider,
  Grid,
  Group,
  Stack,
  Title,
} from "@mantine/core";
import { AssemblyQuantitiesCard } from "~/modules/job/components/AssemblyQuantitiesCard";
import { AssemblyCostingsTable } from "~/modules/job/components/AssemblyCostingsTable";
import { useMemo, useState } from "react";
import { StateChangeButton } from "~/base/state/StateChangeButton";
import { assemblyStateConfig } from "~/base/state/configs";
import { AssemblyActivityModal } from "~/components/AssemblyActivityModal";

export const meta: MetaFunction = () => [{ title: "Assembly Group" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const groupId = Number(params.groupId);
  if (!jobId || !groupId) throw new Response("Not Found", { status: 404 });
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, name: true },
  });
  if (!job) throw new Response("Not Found", { status: 404 });
  const group = await prisma.assemblyGroup.findUnique({
    where: { id: groupId },
  });
  if (!group || group.jobId !== jobId)
    throw new Response("Not Found", { status: 404 });
  const assemblies = await prisma.assembly.findMany({
    where: { assemblyGroupId: groupId },
    include: {
      variantSet: true,
      costings: {
        include: { product: { select: { id: true, sku: true, name: true } } },
      },
    },
    orderBy: { id: "asc" },
  });
  // Fallback: if an assembly doesn't have its own variantSet, try the Product's variantSet
  const prodIds = Array.from(
    new Set(
      (assemblies as any[])
        .map((a) => (a as any).productId)
        .filter((id) => Number.isFinite(Number(id)))
        .map((n) => Number(n))
    )
  );
  const prodVariantMap = new Map<number, string[]>();
  if (prodIds.length) {
    const prods = (await prisma.product.findMany({
      where: { id: { in: prodIds } },
      select: { id: true, variantSet: { select: { variants: true } } },
    })) as Array<{ id: number; variantSet?: { variants: string[] } | null }>;
    for (const p of prods) {
      const vars = (p.variantSet?.variants as any) || [];
      if (Array.isArray(vars) && vars.length) prodVariantMap.set(p.id, vars);
    }
  }
  // Build quantities items per assembly (labels sourced from variantSet)
  const quantityItems = assemblies.map((a: any) => {
    let labels = (a.variantSet?.variants || []) as string[];
    if ((!labels || labels.length === 0) && (a as any).productId) {
      const fb = prodVariantMap.get(Number((a as any).productId));
      if (fb && fb.length) labels = fb as string[];
    }
    return {
      assemblyId: a.id,
      label: `Assembly ${a.id}`,
      variants: {
        labels,
        numVariants:
          Number((a as any).c_numVariants || labels.length || 0) || 0,
      },
      ordered: ((a as any).qtyOrderedBreakdown || []) as number[],
      cut: ((a as any).c_qtyCut_Breakdown || []) as number[],
      make: ((a as any).c_qtyMake_Breakdown || []) as number[],
      pack: ((a as any).c_qtyPack_Breakdown || []) as number[],
      totals: {
        cut: Number((a as any).c_qtyCut || 0),
        make: Number((a as any).c_qtyMake || 0),
        pack: Number((a as any).c_qtyPack || 0),
      },
    };
  });
  // Common vs uncommon costings across assemblies
  // Clean unified view for accordion table: flatten all assembly costings into one list.
  // Accordion grouping will be handled in the table component by productId.
  const unifiedRows = assemblies.flatMap((a: any) =>
    (a.costings || []).map((c: any) => {
      const productId = c?.product?.id || (c as any)?.productId || null;
      const required = Math.max(
        0,
        (Number((a as any).c_qtyOrdered || 0) -
          Number((a as any).c_qtyCut || 0)) *
          Number(c.quantityPerUnit || 0)
      );
      return {
        id: c.id,
        assemblyId: a.id,
        productId,
        sku: c.product?.sku || null,
        name: c.product?.name || null,
        quantityPerUnit: Number(c.quantityPerUnit || 0) || null,
        unitCost: Number(c.unitCost || 0) || null,
        required,
        stats: { locStock: 0, allStock: 0, used: 0 },
      };
    })
  );
  // Fetch recent group-level movements
  const groupMovements = await prisma.productMovement.findMany({
    where: { assemblyGroupId: groupId },
    orderBy: { date: "desc" },
    take: 50,
  });
  return json({
    job,
    group,
    assemblies,
    quantityItems,
    commonRows: unifiedRows,
    groupMovements,
  });
}

export async function action({ request, params }: LoaderFunctionArgs) {
  const jobId = Number(params.jobId);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "assembly.update.fromGroup") {
    const assemblyId = Number(form.get("assemblyId"));
    const name = (form.get("name") as string) || null;
    const status = (form.get("status") as string) || null;
    if (Number.isFinite(assemblyId) && assemblyId) {
      await prisma.assembly.update({
        where: { id: assemblyId },
        data: { name, status },
      });
    }
    return json({ ok: true });
  }
  if (intent === "group.activity.create.cut") {
    const groupId = Number(params.groupId);
    const jId = Number(form.get("jobId")) || jobId;
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
    // For group: choose a representative assembly to anchor the activity and movements
    // The UI will post group-level intent; we map this to a single activity on the first assembly but record movements with assemblyGroupId
    const group = await prisma.assemblyGroup.findUnique({
      where: { id: groupId },
      include: { assemblies: true },
    });
    const firstAssembly = group?.assemblies?.[0];
    if (firstAssembly) {
      // Create a cut activity for the first assembly (preserves existing modal + activity model)
      const activity = await prisma.assemblyActivity.create({
        data: {
          assemblyId: firstAssembly.id,
          jobId: jId,
          name: "Cut (Group)",
          activityType: "cut",
          activityDate,
          qtyBreakdown: qtyArr as any,
          quantity: (qtyArr || []).reduce(
            (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
            0
          ),
          notes: null,
          groupKey: `g${groupId}-${Date.now()}`,
        },
      });
      // Create a single movement header per costing selection with assemblyGroupId and link to activity
      for (const cons of consumptions || []) {
        const rawLines = (cons?.lines || []).filter(
          (l: any) => Number(l.qty) > 0 && Number.isFinite(Number(l.qty))
        );
        if (!rawLines.length) continue;
        const costing = await prisma.costing.findUnique({
          where: { id: cons.costingId },
          select: { productId: true },
        });
        type Enriched = {
          batchId: number;
          qty: number;
          productId: number | null;
          locationId: number | null;
        };
        const enriched: Enriched[] = [];
        for (const line of rawLines) {
          const b = await prisma.batch.findUnique({
            where: { id: line.batchId },
            select: { productId: true, locationId: true },
          });
          enriched.push({
            batchId: line.batchId,
            qty: line.qty,
            productId: b?.productId ?? null,
            locationId: b?.locationId ?? null,
          });
        }
        const byLocation = new Map<number | null, Enriched[]>();
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
              movementType: "AssemblyGroup",
              date: activityDate,
              jobId: jId,
              assemblyGroupId: groupId,
              assemblyActivityId: activity.id,
              costingId: cons.costingId,
              locationOutId: locId ?? undefined,
              productId: headerProductId as number | undefined,
              quantity: totalQty,
              notes: "Group cut consumption",
              groupKey: activity.groupKey ?? undefined,
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
                batchId: line.batchId,
                costingId: cons.costingId,
                quantity: -Math.abs(Number(line.qty)),
                notes: null,
              },
            });
          }
        }
      }
    }
    return json({ ok: true });
  }
  return json({ ok: false });
}

export default function AssemblyGroupRoute() {
  const { job, group, assemblies, quantityItems, commonRows, groupMovements } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [cutOpen, setCutOpen] = useState(false);
  // Use first assembly for labels/costings context; movements will be recorded at group level
  const firstAssembly = (assemblies as any[])[0] as any;
  const getItemFor = (aid: number) =>
    (quantityItems as any[]).find((i) => i.assemblyId === aid) as any;
  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Jobs", href: "/jobs" },
            { label: `Job ${job.id}`, href: `/jobs/${job.id}` },
            {
              label: `Group ${group.id}`,
              href: `/jobs/${job.id}/group/${group.id}`,
            },
          ]}
        />
      </Group>
      <Card withBorder padding="sm">
        <Group justify="space-between" align="center">
          <Group wrap="wrap" gap="sm">
            {(assemblies as any[]).map((a) => (
              <Group key={`ctrl-${a.id}`} gap="xs" align="center">
                <Title order={6}>A{a.id}</Title>
                <StateChangeButton
                  value={(a as any).status || "DRAFT"}
                  defaultValue={(a as any).status || "DRAFT"}
                  onChange={(v) => {
                    const fd = new FormData();
                    fd.set("_intent", "assembly.update.fromGroup");
                    fd.set("assemblyId", String(a.id));
                    if ((a as any).name)
                      fd.set("name", String((a as any).name));
                    fd.set("status", v);
                    submit(fd, { method: "post" });
                  }}
                  config={assemblyStateConfig}
                />
              </Group>
            ))}
          </Group>
          <Button size="xs" variant="light" onClick={() => setCutOpen(true)}>
            Record Group Cut
          </Button>
        </Group>
      </Card>
      <Grid>
        {assemblies.map((a: any) => {
          const item = quantityItems.find((i: any) => i.assemblyId === a.id)!;
          return (
            <Grid.Col span={6} key={a.id}>
              <AssemblyQuantitiesCard
                title={`Quantities — Assembly ${a.id}`}
                variants={item.variants}
                items={[
                  {
                    label: `Assembly ${a.id}`,
                    ordered: item.ordered,
                    cut: item.cut,
                    make: item.make,
                    pack: item.pack,
                    totals: item.totals,
                  },
                ]}
              />
            </Grid.Col>
          );
        })}
        <Grid.Col span={12}>
          <AssemblyCostingsTable
            title="Costings (Group)"
            common={commonRows as any}
            accordionByProduct
          />
        </Grid.Col>
        <Grid.Col span={12}>
          <Card withBorder padding="md">
            <Card.Section inheritPadding py="xs">
              <Title order={4}>Group Activity & Movements (read-only)</Title>
            </Card.Section>
            <Divider my="xs" />
            <div>
              {groupMovements.length === 0 ? (
                <div style={{ padding: 8 }}>No group-level movements yet.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {groupMovements.map((m: any) => (
                    <li key={m.id}>
                      {new Date(m.date).toLocaleString()} —{" "}
                      {m.movementType || "Movement"} — Qty{" "}
                      {String(m.quantity || "")}{" "}
                      {m.groupKey ? `(key ${m.groupKey})` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </Grid.Col>
      </Grid>
      {firstAssembly && (
        <AssemblyActivityModal
          opened={cutOpen}
          onClose={() => {
            setCutOpen(false);
          }}
          assembly={firstAssembly}
          productVariantSet={{
            variants: getItemFor(firstAssembly.id)?.variants?.labels || [],
          }}
          groupQtyItems={assemblies.map((a: any) => {
            const it = getItemFor(a.id);
            return {
              assemblyId: a.id,
              variants: { labels: it?.variants?.labels || [] },
              ordered: it?.ordered || [],
              cut: it?.cut || [],
            };
          })}
          costings={
            (firstAssembly.costings || []).map((c: any) => ({
              ...c,
              component: c.product ?? null,
            })) as any
          }
          activityType="cut"
          mode="create"
          overrideIntent="group.activity.create.cut"
          extraFields={{ groupId: group.id, jobId: job.id }}
        />
      )}
    </Stack>
  );
}
