import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useNavigate,
  useSearchParams,
} from "@remix-run/react";
import { Card, Group, Stack, Table, Text, Title, Button } from "@mantine/core";
import { requireUserId } from "~/utils/auth.server";
import { prisma } from "~/utils/prisma.server";
import { useRegisterNavLocation, usePersistIndexSearch } from "~/hooks/useNavLocation";
import { FindRibbonAuto } from "~/components/find/FindRibbonAuto";
import { BreadcrumbSet } from "@aa/timber";
import { VirtualizedNavDataTable } from "~/components/VirtualizedNavDataTable";
import { useMemo } from "react";
import { useFindHrefAppender } from "~/base/find/sessionFindState";

type Row = {
  id: number;
  name: string | null;
  assemblyType: string | null;
  jobId: number | null;
  projectCode: string | null;
  jobName: string | null;
  customerName: string | null;
  primaryCostingName: string | null;
  ordered: number;
  cut: number;
  sew: number;
  finish: number;
  pack: number;
};

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  const assemblies = await prisma.assembly.findMany({
    select: {
      id: true,
      name: true,
      assemblyType: true,
      qtyOrderedBreakdown: true,
      job: {
        select: {
          id: true,
          projectCode: true,
          name: true,
          company: { select: { name: true } },
        },
      },
      primaryCosting: {
        select: {
          product: { select: { name: true, sku: true } },
          notes: true,
        },
      },
    },
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { job: { projectCode: { contains: q, mode: "insensitive" } } },
            { job: { name: { contains: q, mode: "insensitive" } } },
            { job: { company: { name: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : undefined,
    orderBy: [{ id: "desc" }],
  });

  const ids = assemblies.map((a) => a.id);
  const activitySums = ids.length
    ? await prisma.assemblyActivity.groupBy({
        by: ["assemblyId", "stage"],
        where: {
          assemblyId: { in: ids },
          kind: { not: "defect" },
        },
        _sum: { quantity: true },
      })
    : [];
  const packedSums = ids.length
    ? await prisma.boxLine.groupBy({
        by: ["assemblyId"],
        where: { assemblyId: { in: ids }, packingOnly: { not: true } },
        _sum: { quantity: true },
      })
    : [];
  const sumsByAssembly = new Map<number, Record<string, number>>();
  activitySums.forEach((row) => {
    const m = sumsByAssembly.get(row.assemblyId) || {};
    m[row.stage] = Number(row._sum.quantity ?? 0) || 0;
    sumsByAssembly.set(row.assemblyId, m);
  });
  const packedByAssembly = new Map<number, number>();
  packedSums.forEach((row) => {
    if (!row.assemblyId) return;
    packedByAssembly.set(
      row.assemblyId,
      Number(row._sum.quantity ?? 0) || 0
    );
  });

  const rows: Row[] = assemblies.map((a) => {
    const sums = sumsByAssembly.get(a.id) || {};
    const ordered = Array.isArray(a.qtyOrderedBreakdown)
      ? a.qtyOrderedBreakdown.reduce(
          (t, n) => t + (Number(n) || 0),
          0
        )
      : 0;
    return {
      id: a.id,
      name: a.name,
      assemblyType: a.assemblyType,
      jobId: a.job?.id ?? null,
      projectCode: a.job?.projectCode ?? null,
      jobName: a.job?.name ?? null,
      customerName: a.job?.company?.name ?? null,
      primaryCostingName:
        a.primaryCosting?.product?.name ||
        a.primaryCosting?.product?.sku ||
        null,
      ordered,
      cut: Number(sums.cut ?? 0),
      sew: Number(sums.sew ?? 0),
      finish: Number(sums.finish ?? 0),
      pack: packedByAssembly.get(a.id) ?? 0,
    };
  });

  return json({ rows });
}

export default function ProductionLedgerIndexRoute() {
  const { rows } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useRegisterNavLocation({ includeSearch: true, moduleKey: "production-ledger" });
  usePersistIndexSearch("/production-ledger");
  const appendHref = useFindHrefAppender();

  const columns = useMemo(
    () => [
      {
        accessor: "id",
        title: "Assembly",
        width: 110,
        render: (r: any) =>
          r.jobId ? (
            <Link to={`/jobs/${r.jobId}/assembly/${r.id}`}>A{r.id}</Link>
          ) : (
            `A${r.id}`
          ),
      },
      { accessor: "customerName", title: "Customer", width: 180 },
      {
        accessor: "job",
        title: "Job",
        width: 220,
        render: (r: any) =>
          r.jobId ? (
            <div>
              <Link to={`/jobs/${r.jobId}`}>
                {r.projectCode ? `${r.projectCode} ${r.jobId}` : `Job ${r.jobId}`}
              </Link>
              <div style={{ fontSize: 12, color: "#666" }}>{r.jobName || ""}</div>
            </div>
          ) : (
            "—"
          ),
      },
      { accessor: "name", title: "Assembly Name", width: 200 },
      { accessor: "assemblyType", title: "Type", width: 80 },
      { accessor: "primaryCostingName", title: "Primary Costing", width: 180 },
      {
        accessor: "ordered",
        title: "Ordered",
        width: 90,
        render: (r: any) => r.ordered ?? 0,
      },
      { accessor: "cut", title: "Cut", width: 90, render: (r: any) => r.cut ?? 0 },
      { accessor: "sew", title: "Sew", width: 90, render: (r: any) => r.sew ?? 0 },
      {
        accessor: "finish",
        title: "Finish",
        width: 90,
        render: (r: any) => r.finish ?? 0,
      },
      { accessor: "pack", title: "Packed", width: 90, render: (r: any) => r.pack ?? 0 },
    ],
    []
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Production Ledger", href: appendHref("/production-ledger") },
          ]}
        />
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            component={Link}
            to="/production/dashboard"
          >
            Dashboard
          </Button>
          <Button size="xs" variant="default" onClick={() => navigate(0)}>
            Refresh
          </Button>
        </Group>
      </Group>
      <FindRibbonAuto views={[]} activeView={null} />
      <Card withBorder padding="sm">
        <VirtualizedNavDataTable
          records={rows}
          columns={columns as any}
          currentId={null}
          autoHeightOffset={120}
          rowHeight={40}
          multiselect={false}
        />
        {rows.length === 0 ? (
          <Group justify="center" py="md">
            <Text c="dimmed">No assemblies found.</Text>
          </Group>
        ) : null}
      </Card>
    </Stack>
  );
}
