import type {
  LoaderFunctionArgs,
  MetaFunction,
  ActionFunctionArgs,
} from "@remix-run/node";
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
import { AssembliesEditor } from "~/modules/job/components/AssembliesEditor";
import {
  buildCostingRows,
  canEditQpuDefault,
} from "~/modules/job/services/costingsView";
import { useMemo, useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useInitGlobalFormContext } from "@aa/timber";
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
    buildCostingRows({
      assemblyId: a.id,
      costings: (a.costings || []) as any,
      requiredInputs: {
        qtyOrdered: (a as any).c_qtyOrdered ?? 0,
        qtyCut: (a as any).c_qtyCut ?? 0,
      },
      priceMultiplier: 1,
      costingStats: undefined,
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

export async function action({ request, params }: ActionFunctionArgs) {
  const jobId = Number(params.jobId);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "group.updateOrderedBreakdown") {
    const orderedStr = String(form.get("orderedArr") || "{}");
    const qpuStr = String(form.get("qpu") || "{}");
    const activityStr = String(form.get("activity") || "{}");
    let orderedByAssembly: Record<string, number[]> = {};
    let qpu: Record<string, number> = {};
    let activity: Record<string, string> = {};
    try {
      const obj = JSON.parse(orderedStr);
      if (obj && typeof obj === "object") orderedByAssembly = obj;
    } catch {}
    try {
      const obj = JSON.parse(qpuStr);
      if (obj && typeof obj === "object") qpu = obj;
    } catch {}
    try {
      const obj = JSON.parse(activityStr);
      if (obj && typeof obj === "object") activity = obj;
    } catch {}
    // Apply ordered breakdown per assembly
    for (const [aid, arr] of Object.entries(orderedByAssembly)) {
      const assemblyId = Number(aid);
      if (!Number.isFinite(assemblyId)) continue;
      await prisma.assembly.update({
        where: { id: assemblyId },
        data: { qtyOrderedBreakdown: Array.isArray(arr) ? (arr as any) : [] },
      });
    }
    // Apply Qty/Unit updates (if any)
    const entries = Object.entries(qpu)
      .filter(
        ([id, v]) => Number.isFinite(Number(id)) && Number.isFinite(Number(v))
      )
      .map(([id, v]) => [Number(id), Number(v)] as const);
    for (const [cid, val] of entries) {
      await prisma.costing.update({
        where: { id: cid },
        data: { quantityPerUnit: val },
      });
    }
    // Apply Activity Used updates (if any)
    const actEntries = Object.entries(activity)
      .filter(([id, v]) => Number.isFinite(Number(id)) && typeof v === "string")
      .map(([id, v]) => [Number(id), String(v).toLowerCase()] as const);
    const allowed = new Set(["cut", "make"]);
    for (const [cid, val] of actEntries) {
      if (!allowed.has(val)) continue;
      await prisma.costing.update({
        where: { id: cid },
        data: { activityUsed: val },
      });
    }
    return json({ ok: true });
  }
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
  // RHF for inline group edits mirroring assembly fields
  const editForm = useForm<{
    orderedByAssembly: Record<string, number[]>;
    qpu: Record<string, number>;
    activity: Record<string, string>;
  }>({
    defaultValues: {
      orderedByAssembly: Object.fromEntries(
        (assemblies as any[]).map((a: any) => [
          String(a.id),
          ((a as any).qtyOrderedBreakdown || []) as number[],
        ])
      ) as any,
      qpu: Object.fromEntries(
        (assemblies as any[])
          .flatMap((a: any) => a.costings || [])
          .map((c: any) => [String(c.id), Number(c.quantityPerUnit || 0) || 0])
      ) as any,
      activity: Object.fromEntries(
        (assemblies as any[])
          .flatMap((a: any) => a.costings || [])
          .map((c: any) => [
            String(c.id),
            String(c.activityUsed ?? "").toLowerCase(),
          ])
      ) as any,
    },
  });
  useEffect(() => {
    // Reset when group changes (or after save)
    editForm.reset(
      {
        orderedByAssembly: Object.fromEntries(
          (assemblies as any[]).map((a: any) => [
            String(a.id),
            ((a as any).qtyOrderedBreakdown || []) as number[],
          ])
        ) as any,
        qpu: Object.fromEntries(
          (assemblies as any[])
            .flatMap((a: any) => a.costings || [])
            .map((c: any) => [
              String(c.id),
              Number(c.quantityPerUnit || 0) || 0,
            ])
        ) as any,
        activity: Object.fromEntries(
          (assemblies as any[])
            .flatMap((a: any) => a.costings || [])
            .map((c: any) => [
              String(c.id),
              String(c.activityUsed ?? "").toLowerCase(),
            ])
        ) as any,
      },
      { keepDirty: false }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);
  const saveUpdate = () => {
    const fd = new FormData();
    fd.set("_intent", "group.updateOrderedBreakdown");
    fd.set(
      "orderedArr",
      JSON.stringify(editForm.getValues("orderedByAssembly"))
    );
    fd.set("qpu", JSON.stringify(editForm.getValues("qpu")));
    fd.set("activity", JSON.stringify(editForm.getValues("activity")));
    submit(fd, { method: "post" });
  };
  useInitGlobalFormContext(editForm as any, saveUpdate, () =>
    editForm.reset({
      orderedByAssembly: Object.fromEntries(
        (assemblies as any[]).map((a: any) => [
          String(a.id),
          ((a as any).qtyOrderedBreakdown || []) as number[],
        ])
      ) as any,
      qpu: Object.fromEntries(
        (assemblies as any[])
          .flatMap((a: any) => a.costings || [])
          .map((c: any) => [String(c.id), Number(c.quantityPerUnit || 0) || 0])
      ) as any,
      activity: Object.fromEntries(
        (assemblies as any[])
          .flatMap((a: any) => a.costings || [])
          .map((c: any) => [
            String(c.id),
            String(c.activityUsed ?? "").toLowerCase(),
          ])
      ) as any,
    })
  );
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
        <Grid.Col span={12}>
          <AssembliesEditor
            mode="group"
            job={job as any}
            assemblies={assemblies as any}
            quantityItems={quantityItems as any}
            priceMultiplier={1}
            costingStats={undefined}
            saveIntent="group.updateOrderedBreakdown"
            stateChangeIntent="assembly.update.fromGroup"
            groupMovements={groupMovements as any}
            groupContext={{ jobId: job.id, groupId: group.id }}
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
