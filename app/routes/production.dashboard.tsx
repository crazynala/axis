import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { BreadcrumbSet } from "@aa/timber";
import { requireUserId } from "~/utils/auth.server";
import { prisma } from "~/utils/prisma.server";
import { buildExternalStepsByAssembly } from "~/modules/job/services/externalSteps.server";
import type { DerivedExternalStep } from "~/modules/job/types/externalSteps";
import {
  loadAssemblyRollups,
  type AssemblyRollup,
} from "~/modules/production/services/rollups.server";
import {
  buildRiskSignals,
  type AssemblyRiskSignals,
  type PurchaseOrderLineSummary,
  type RiskAssemblyInput,
} from "~/modules/production/services/riskSignals.server";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import type { ActivityAction, ActivityKind } from "@prisma/client";
import { AssemblyStage } from "@prisma/client";

type LoaderAssembly = {
  id: number;
  name: string | null;
  job: {
    id: number;
    projectCode: string | null;
    name: string | null;
    targetDate: string | null;
    dropDeadDate: string | null;
    customerName: string | null;
  } | null;
  productName: string | null;
  rollup: AssemblyRollup | null;
  risk: AssemblyRiskSignals;
  externalSteps: DerivedExternalStep[];
};

type LoaderData = {
  asOf: string;
  assemblies: LoaderAssembly[];
};

export const meta: MetaFunction = () => [
  { title: "Production Dashboard" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const take =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(Math.floor(limitParam), 25), 200)
      : 100;

  const assemblies = await prisma.assembly.findMany({
    where: {
      job: { isActive: { not: false } },
    },
    include: {
      job: {
        select: {
          id: true,
          projectCode: true,
          name: true,
          targetDate: true,
          dropDeadDate: true,
          company: { select: { name: true } },
        },
      },
      product: {
        select: {
          id: true,
          name: true,
          leadTimeDays: true,
          supplier: {
            select: {
              id: true,
              name: true,
              defaultLeadTimeDays: true,
            },
          },
        },
      },
      costings: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              leadTimeDays: true,
              supplier: {
                select: {
                  id: true,
                  name: true,
                  defaultLeadTimeDays: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ job: { targetDate: "asc" } }, { id: "asc" }],
    take,
  });

  const assemblyIds = assemblies.map((a) => a.id);
  const jobIds = Array.from(
    new Set(assemblies.map((a) => a.job?.id).filter(Boolean) as number[])
  );
  const jobAssemblyMap = new Map<number, number[]>();
  assemblies.forEach((assembly) => {
    const jobId = assembly.job?.id;
    if (!jobId) return;
    const arr = jobAssemblyMap.get(jobId) || [];
    arr.push(assembly.id);
    jobAssemblyMap.set(jobId, arr);
  });

  const rollups = await loadAssemblyRollups(assemblyIds);

  const activities = assemblyIds.length
    ? await prisma.assemblyActivity.findMany({
        where: {
          assemblyId: { in: assemblyIds },
          OR: [
            {
              stage: {
                in: [AssemblyStage.cut, AssemblyStage.sew, AssemblyStage.finish],
              },
            },
            { externalStepType: { not: null } },
          ],
        },
        select: {
          id: true,
          assemblyId: true,
          stage: true,
          kind: true,
          action: true,
          activityDate: true,
          quantity: true,
          externalStepType: true,
          vendorCompany: { select: { id: true, name: true } },
        },
        orderBy: [{ activityDate: "desc" }, { id: "desc" }],
      })
    : [];
  const activitiesByAssembly = new Map<number, any[]>();
  activities.forEach((activity) => {
    const normalized = normalizeActivity(activity);
    const aid = normalized.assemblyId;
    if (!aid) return;
    const arr = activitiesByAssembly.get(aid) || [];
    arr.push(normalized);
    activitiesByAssembly.set(aid, arr);
  });

  const quantityByAssembly = new Map<
    number,
    { totals?: { cut?: number; sew?: number; finish?: number; pack?: number } }
  >();
  rollups.forEach((rollup, id) => {
    quantityByAssembly.set(id, {
      totals: {
        cut: rollup.cutGoodQty,
        sew: rollup.sewGoodQty,
        finish: rollup.finishGoodQty,
        pack: rollup.packedQty,
      },
    });
  });

  const externalStepsByAssembly = buildExternalStepsByAssembly({
    assemblies: assemblies as any,
    activitiesByAssembly,
    quantityByAssembly,
  });

  const poLinesByAssembly = new Map<number, PurchaseOrderLineSummary[]>();
  if (assemblyIds.length) {
    const whereClause =
      jobIds.length > 0
        ? {
            OR: [
              { assemblyId: { in: assemblyIds } },
              { jobId: { in: jobIds } },
            ],
          }
        : { assemblyId: { in: assemblyIds } };
    const poLines = await prisma.purchaseOrderLine.findMany({
      where: whereClause,
      select: {
        id: true,
        assemblyId: true,
        jobId: true,
        etaDate: true,
        qtyReceived: true,
        quantityOrdered: true,
        quantity: true,
      },
    });
    const assemblyIdSet = new Set(assemblyIds);
    poLines.forEach((line) => {
      const explicitAssemblyId = line.assemblyId ?? null;
      const targets: number[] = [];
      if (explicitAssemblyId && assemblyIdSet.has(explicitAssemblyId)) {
        targets.push(explicitAssemblyId);
      } else if (line.jobId) {
        const fromJob = jobAssemblyMap.get(line.jobId) || [];
        targets.push(...fromJob);
      }
      if (!targets.length) return;
      const qtyOrdered = toNumber(line.quantityOrdered ?? line.quantity);
      const qtyReceived = toNumber(line.qtyReceived);
      targets.forEach((assemblyId) => {
        const arr = poLinesByAssembly.get(assemblyId) || [];
        arr.push({
          id: line.id,
          etaDate: line.etaDate ? new Date(line.etaDate) : null,
          qtyOrdered,
          qtyReceived,
        });
        poLinesByAssembly.set(assemblyId, arr);
      });
    });
  }

  const riskAssemblies: RiskAssemblyInput[] = assemblies.map((assembly) => ({
    id: assembly.id,
    jobId: assembly.job?.id ?? null,
    jobTargetDate:
      assembly.job?.targetDate ??
      assembly.job?.dropDeadDate ??
      null,
  }));
  const riskSignals = buildRiskSignals({
    assemblies: riskAssemblies,
    rollups,
    externalStepsByAssembly,
    purchaseOrdersByAssembly: poLinesByAssembly,
  });

  const data: LoaderData = {
    asOf: new Date().toISOString(),
    assemblies: assemblies.map((assembly) => ({
      id: assembly.id,
      name: assembly.name,
      job: assembly.job
        ? {
            id: assembly.job.id,
            projectCode: assembly.job.projectCode,
            name: assembly.job.name,
            targetDate: assembly.job.targetDate
              ? assembly.job.targetDate.toISOString()
              : null,
            dropDeadDate: assembly.job.dropDeadDate
              ? assembly.job.dropDeadDate.toISOString()
              : null,
            customerName: assembly.job.company?.name ?? null,
          }
        : null,
      productName: assembly.product?.name ?? null,
      rollup: rollups.get(assembly.id) ?? null,
      risk:
        riskSignals.get(assembly.id) ??
        {
          assemblyId: assembly.id,
          externalEta: null,
          externalEtaSource: null,
          externalEtaStepLabel: null,
          hasExternalLate: false,
          externalDueSoon: false,
          poHold: false,
          poHoldReason: null,
          poBlockingEta: null,
          poBlockingLineId: null,
          nextActions: [],
          vendorSteps: [],
        },
      externalSteps: externalStepsByAssembly[assembly.id] ?? [],
    })),
  };

  return json(data);
}

export default function ProductionDashboardRoute() {
  const data = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState<string>("at-risk");
  const navigate = useNavigate();
  useRegisterNavLocation({ moduleKey: "production-dashboard" });

  const atRiskRows = useMemo(() => {
    const rows = data.assemblies.slice();
    rows.sort((a, b) => {
      const lateDiff =
        Number(b.risk.hasExternalLate) - Number(a.risk.hasExternalLate);
      if (lateDiff !== 0) return lateDiff;
      const holdDiff =
        Number(b.risk.poHold) - Number(a.risk.poHold);
      if (holdDiff !== 0) return holdDiff;
      const dueSoonDiff =
        Number(b.risk.externalDueSoon) - Number(a.risk.externalDueSoon);
      if (dueSoonDiff !== 0) return dueSoonDiff;
      const aDate = getTargetDate(a);
      const bDate = getTargetDate(b);
      if (aDate && bDate) return aDate.getTime() - bDate.getTime();
      if (aDate) return -1;
      if (bDate) return 1;
      return a.id - b.id;
    });
    return rows;
  }, [data.assemblies]);

  const vendorRows = useMemo(() => {
    return data.assemblies
      .flatMap((assembly) =>
        (assembly.risk.vendorSteps || []).map((step) => ({
          assembly,
          step,
        }))
      )
      .sort((a, b) => {
        const aTime = stepTime(a.step.etaDate);
        const bTime = stepTime(b.step.etaDate);
        if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
          return aTime - bTime;
        }
        if (Number.isFinite(aTime)) return -1;
        if (Number.isFinite(bTime)) return 1;
        return a.assembly.id - b.assembly.id;
      });
  }, [data.assemblies]);

  const nextActionRows = useMemo(() => {
    const priority: Record<string, number> = {
      FOLLOW_UP_VENDOR: 0,
      RESOLVE_PO: 1,
      SEND_OUT: 2,
    };
    return data.assemblies
      .flatMap((assembly) =>
        assembly.risk.nextActions.map((action) => ({
          assembly,
          action,
        }))
      )
      .sort((a, b) => {
        const aRank = priority[a.action.kind] ?? 99;
        const bRank = priority[b.action.kind] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return a.assembly.id - b.assembly.id;
      });
  }, [data.assemblies]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[{ label: "Production Dashboard", href: "/production/dashboard" }]}
        />
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Updated {formatDateTime(data.asOf)}
          </Text>
          <Button size="xs" variant="default" onClick={() => navigate(0)}>
            Refresh
          </Button>
        </Group>
      </Group>
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value || "at-risk")}>
        <Tabs.List>
          <Tabs.Tab value="at-risk">At Risk</Tabs.Tab>
          <Tabs.Tab value="vendor">Out at Vendor</Tabs.Tab>
          <Tabs.Tab value="actions">Needs Action</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="at-risk" pt="md">
          <Card withBorder padding="md">
            <Table
              striped
              highlightOnHover
              verticalSpacing="xs"
              horizontalSpacing="md"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>External step</Table.Th>
                  <Table.Th>External ETA</Table.Th>
                  <Table.Th>PO Hold</Table.Th>
                  <Table.Th>PO ETA</Table.Th>
                  <Table.Th>Target date</Table.Th>
                  <Table.Th>Ready to pack</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {atRiskRows.map((row) => (
                  <Table.Tr key={row.id}>
                    <Table.Td>
                      <Stack gap={0}>
                        {row.job ? (
                          <Link to={`/jobs/${row.job.id}/assembly/${row.id}`}>
                            A{row.id}
                          </Link>
                        ) : (
                          <Text fw={600}>A{row.id}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {row.name || row.productName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {row.job ? (
                          <Link to={`/jobs/${row.job.id}`}>
                            {formatJobLabel(row.job)}
                          </Link>
                        ) : (
                          "—"
                        )}
                        <Text size="xs" c="dimmed">
                          {row.job?.customerName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={4}>
                        {renderExternalStatus(row.risk)}
                        <Text size="xs" c="dimmed">
                          {row.risk.externalEtaStepLabel || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {row.risk.externalEta
                        ? formatDate(row.risk.externalEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {row.risk.poHold ? (
                        <Stack gap={2}>
                          <Badge color="yellow" variant="filled" size="sm">
                            PO HOLD (MVP)
                          </Badge>
                          <Text size="xs" c="dimmed">
                            {row.risk.poHoldReason || "Blocking PO line"}
                          </Text>
                        </Stack>
                      ) : (
                        <Text size="sm">—</Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {row.risk.poBlockingEta
                        ? formatDate(row.risk.poBlockingEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {formatDate(row.job?.targetDate || row.job?.dropDeadDate)}
                    </Table.Td>
                    <Table.Td>
                      {formatQuantity(row.rollup?.readyToPackQty ?? 0)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!atRiskRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No assemblies ready for display.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="vendor" pt="md">
          <Card withBorder padding="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Job</Table.Th>
                  <Table.Th>Step</Table.Th>
                  <Table.Th>Vendor</Table.Th>
                  <Table.Th>ETA</Table.Th>
                  <Table.Th>ETA source</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {vendorRows.map(({ assembly, step }) => (
                  <Table.Tr
                    key={`${assembly.id}-${step.stepLabel}-${step.etaDate ?? "na"}-${
                      step.vendorName ?? "none"
                    }`}
                  >
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}>
                            A{assembly.id}
                          </Link>
                        ) : (
                          <Text fw={600}>A{assembly.id}</Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {assembly.name || assembly.productName || "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {assembly.job ? (
                        <Link to={`/jobs/${assembly.job.id}`}>
                          {formatJobLabel(assembly.job)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>{step.stepLabel}</Table.Td>
                    <Table.Td>{step.vendorName || "Pending"}</Table.Td>
                    <Table.Td>{formatDate(step.etaDate)}</Table.Td>
                    <Table.Td>
                      {step.etaSource
                        ? LEAD_TIME_SOURCE_LABELS[step.etaSource] || step.etaSource
                        : "—"}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!vendorRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No open vendor steps.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="actions" pt="md">
          <Card withBorder padding="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Action</Table.Th>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Detail</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {nextActionRows.map(({ assembly, action }, index) => (
                  <Table.Tr key={`${assembly.id}-${action.kind}-${index}`}>
                    <Table.Td>{renderActionLabel(action.kind)}</Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}>
                            A{assembly.id} – {assembly.name || assembly.productName || "—"}
                          </Link>
                        ) : (
                          <Text fw={600}>
                            A{assembly.id} – {assembly.name || assembly.productName || "—"}
                          </Text>
                        )}
                        <Text size="xs" c="dimmed">
                          {assembly.job ? formatJobLabel(assembly.job) : "—"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{action.label}</Text>
                      {action.detail ? (
                        <Text size="xs" c="dimmed">
                          {action.detail}
                        </Text>
                      ) : null}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!nextActionRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">Nothing needs attention right now.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function normalizeActivity(activity: any) {
  const stage = normalizeStage(activity.stage);
  const kind =
    (activity.kind as ActivityKind | null) ?? ("normal" as ActivityKind);
  const action =
    (activity.action as ActivityAction | null) ??
    (["cut", "sew", "finish"].includes(stage) ? "RECORDED" : null);
  return {
    ...activity,
    stage,
    kind,
    action,
  };
}

function normalizeStage(value?: string | null) {
  if (!value) return "other";
  const lower = value.toString().toLowerCase();
  if (lower === "make") return "finish";
  if (lower === "trim") return "sew";
  if (lower === "embroidery") return "finish";
  return lower;
}

function getTargetDate(assembly: LoaderAssembly) {
  const raw = assembly.job?.targetDate || assembly.job?.dropDeadDate;
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function renderExternalStatus(risk: AssemblyRiskSignals) {
  if (risk.hasExternalLate) {
    return (
      <Badge color="red" size="sm">
        Late
      </Badge>
    );
  }
  if (risk.externalDueSoon) {
    return (
      <Badge color="orange" size="sm">
        Due soon
      </Badge>
    );
  }
  return (
    <Badge color="gray" size="sm">
      On track
    </Badge>
  );
}

function renderActionLabel(kind: string) {
  switch (kind) {
    case "FOLLOW_UP_VENDOR":
      return "Follow up vendor";
    case "RESOLVE_PO":
      return "Resolve PO";
    case "SEND_OUT":
      return "Send out";
    default:
      return kind;
  }
}

function formatJobLabel(job: LoaderAssembly["job"]) {
  if (!job) return "—";
  if (job.projectCode) return `${job.projectCode} • Job ${job.id}`;
  return `Job ${job.id}`;
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

function formatQuantity(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString();
}

function toNumber(value: any) {
  if (value == null) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function stepTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

const LEAD_TIME_SOURCE_LABELS: Record<string, string> = {
  COSTING: "Costing",
  PRODUCT: "Product",
  COMPANY: "Vendor default",
};
