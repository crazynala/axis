import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  ActivityAction,
  ActivityKind,
  AssemblyStage,
} from "@prisma/client";
import { prisma } from "~/utils/prisma.server";
import { Link, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  Collapse,
  Drawer,
  Modal,
  TextInput,
  NativeSelect,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { useMemo, useState, useCallback, useEffect } from "react";
import { BreadcrumbSet } from "@aa/timber";
import { requireUserId } from "~/utils/auth.server";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import {
  fetchDashboardRows,
  type LoaderAssembly,
  type LoaderData,
} from "~/modules/production/services/production.dashboard.server";
import { MaterialCoverageDetails } from "~/modules/materials/components/MaterialCoverageDetails";
import type { AssemblyRiskSignals } from "~/modules/production/services/riskSignals.server";

const LEAD_TIME_SOURCE_LABELS: Record<string, string> = {
  COSTING: "Costing",
  PRODUCT: "Product",
  COMPANY: "Vendor default",
};

export const meta: MetaFunction = () => [{ title: "Production Dashboard" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const take =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.max(Math.floor(limitParam), 25), 50000)
      : 50000;
  const { loadDashboardData } = await import(
    "../services/production.dashboard.server"
  );
  const data = await loadDashboardData(take);
  console.log("[production.dashboard.loader] assemblies", {
    take,
    count: Array.isArray(data.assemblies) ? data.assemblies.length : null,
    type: typeof data.assemblies,
    keys: data ? Object.keys(data || {}) : [],
    assembliesTag: data?.assemblies
      ? Object.prototype.toString.call(data.assemblies)
      : "none",
    assembliesKeys:
      data && data.assemblies && typeof data.assemblies === "object"
        ? Object.keys(data.assemblies as any)
        : [],
  });
  return json(data);
}

export async function action({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  if (intent === "assignReservation") {
    const assemblyId = Number(form.get("assemblyId"));
    const productId = Number(form.get("productId"));
    const poLineId = Number(form.get("poLineId"));
    const qty = Number(form.get("qty"));
    if (
      !Number.isFinite(assemblyId) ||
      !Number.isFinite(productId) ||
      !Number.isFinite(poLineId) ||
      !Number.isFinite(qty) ||
      qty <= 0
    ) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const poLine = await prisma.purchaseOrderLine.findUnique({
      where: { id: poLineId },
      select: { id: true, productId: true, qtyReceived: true, quantityOrdered: true, quantity: true },
    });
    if (!poLine) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    if (poLine.productId && poLine.productId !== productId) {
      return json({ ok: false, error: "product_mismatch" }, { status: 400 });
    }
    const qtyOrdered = Number(poLine.quantityOrdered ?? poLine.quantity ?? 0) || 0;
    const qtyReceived = Number(poLine.qtyReceived ?? 0) || 0;
    const reservedTotals = await prisma.supplyReservation.aggregate({
      _sum: { qtyReserved: true },
      where: { purchaseOrderLineId: poLineId },
    });
    const existingReserved =
      Number(reservedTotals._sum.qtyReserved ?? 0) || 0;
    const remaining = Math.max(qtyOrdered - qtyReceived - existingReserved, 0);
    if (!(remaining > 0)) {
      return json({ ok: false, error: "no_remaining" }, { status: 400 });
    }
    const reserveQty = Math.min(qty, remaining);
    if (!(reserveQty > 0)) {
      return json({ ok: false, error: "invalid_qty" }, { status: 400 });
    }
    await prisma.supplyReservation.create({
      data: {
        assemblyId,
        productId,
        purchaseOrderLineId: poLineId,
        qtyReserved: reserveQty,
      },
    });
    return json({ ok: true });
  }
  if (intent === "acceptGap") {
    const assemblyId = Number(form.get("assemblyId"));
    const productId = Number(form.get("productId"));
    if (!Number.isFinite(assemblyId) || !Number.isFinite(productId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const rows = await fetchDashboardRows([assemblyId]);
    const assembly = rows[0];
    if (!assembly?.materialCoverage) {
      return json({ ok: false, error: "missing" }, { status: 404 });
    }
    const material = assembly.materialCoverage.materials.find(
      (m) => m.productId === productId
    );
    if (!material) {
      return json({ ok: false, error: "material_missing" }, { status: 404 });
    }
    const uncovered = Number(material.qtyUncovered ?? 0) || 0;
    if (!(uncovered > 0)) {
      return json({ ok: false, error: "no_gap" }, { status: 400 });
    }
    const priorAbs =
      assembly.materialCoverageToleranceAbs != null
        ? Number(assembly.materialCoverageToleranceAbs)
        : null;
    const nextAbs = Math.max(priorAbs ?? 0, uncovered);
    const actor = await resolveUserLabel(userId);
    const productLabel =
      material.productName ?? `product ${material.productId ?? productId}`;
    const noteParts = [
      `Accepted coverage gap for ${productLabel} (#${productId})`,
      `raw gap ${formatNumber(uncovered)}`,
      `abs ${formatNumber(priorAbs)} → ${formatNumber(nextAbs)}`,
    ];
    await prisma.$transaction([
      prisma.assembly.update({
        where: { id: assemblyId },
        data: { materialCoverageToleranceAbs: nextAbs },
      }),
      prisma.assemblyActivity.create({
        data: {
          assemblyId,
          jobId: assembly.job?.id ?? null,
          stage: AssemblyStage.order,
          action: ActivityAction.NOTE,
          kind: ActivityKind.normal,
          activityDate: new Date(),
          notes: noteParts.join(" • "),
          createdBy: actor,
        },
      }),
    ]);
    return json({ ok: true });
  }
  if (intent === "updateTolerance") {
    const assemblyId = Number(form.get("assemblyId"));
    const reset = form.get("reset") === "1";
    if (!Number.isFinite(assemblyId)) {
      return json({ ok: false, error: "invalid" }, { status: 400 });
    }
    const pctRaw = form.get("pct");
    const absRaw = form.get("abs");
    const pctVal =
      !reset && pctRaw != null && pctRaw !== ""
        ? Number(pctRaw)
        : null;
    const absVal =
      !reset && absRaw != null && absRaw !== ""
        ? Number(absRaw)
        : null;
    await prisma.assembly.update({
      where: { id: assemblyId },
      data: {
        materialCoverageTolerancePct:
          pctVal != null && Number.isFinite(pctVal) && pctVal >= 0
            ? pctVal
            : null,
        materialCoverageToleranceAbs:
          absVal != null && Number.isFinite(absVal) && absVal >= 0
            ? absVal
            : null,
      },
    });
    return json({ ok: true });
  }
  return json({ ok: false }, { status: 400 });
}

export default function ProductionDashboardRoute() {
  const data = useLoaderData<LoaderData>();
  const assemblies = Array.isArray(data?.assemblies)
    ? (data.assemblies as LoaderAssembly[])
    : [];
  console.log("[production.dashboard] client data", {
    assemblies: assemblies.length,
    type: typeof data?.assemblies,
  });
  const [activeTab, setActiveTab] = useState<string>("at-risk");
  const [poHoldFocus, setPoHoldFocus] = useState<LoaderAssembly | null>(null);
  const [assignTarget, setAssignTarget] = useState<{
    assembly: LoaderAssembly;
    productId: number;
    productName: string | null;
    uncovered: number;
  } | null>(null);
  const assignFetcher = useFetcher();
  const acceptGapFetcher = useFetcher();
  const toleranceFetcher = useFetcher();
  const navigate = useNavigate();
  useRegisterNavLocation({ moduleKey: "production-dashboard" });
  const toleranceDefaults = data.toleranceDefaults;

  const handleAssignSubmit = useCallback(
    (lineId: number, qty: number) => {
      if (!assignTarget) return;
      const fd = new FormData();
      fd.set("_intent", "assignReservation");
      fd.set("assemblyId", String(assignTarget.assembly.id));
      fd.set("productId", String(assignTarget.productId));
      fd.set("poLineId", String(lineId));
      fd.set("qty", String(qty));
      assignFetcher.submit(fd, { method: "post" });
    },
    [assignFetcher, assignTarget]
  );

  useEffect(() => {
    if (assignFetcher.state === "idle" && assignFetcher.data) {
      setAssignTarget(null);
      navigate(0);
    }
  }, [assignFetcher.state, assignFetcher.data, navigate]);
  useEffect(() => {
    if (
      (acceptGapFetcher.state === "idle" && acceptGapFetcher.data) ||
      (toleranceFetcher.state === "idle" && toleranceFetcher.data)
    ) {
      navigate(0);
    }
  }, [
    acceptGapFetcher.state,
    acceptGapFetcher.data,
    toleranceFetcher.state,
    toleranceFetcher.data,
    navigate,
  ]);

  const handleAcceptGap = useCallback(
    (assemblyId: number, productId: number) => {
      const fd = new FormData();
      fd.set("_intent", "acceptGap");
      fd.set("assemblyId", String(assemblyId));
      fd.set("productId", String(productId));
      acceptGapFetcher.submit(fd, { method: "post" });
    },
    [acceptGapFetcher]
  );

  const handleToleranceSave = useCallback(
    (assemblyId: number, abs: number | null, pct: number | null) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      if (pct != null && Number.isFinite(pct)) {
        fd.set("pct", String(pct));
      }
      if (abs != null && Number.isFinite(abs)) {
        fd.set("abs", String(abs));
      }
      toleranceFetcher.submit(fd, { method: "post" });
    },
    [toleranceFetcher]
  );

  const handleToleranceReset = useCallback(
    (assemblyId: number) => {
      const fd = new FormData();
      fd.set("_intent", "updateTolerance");
      fd.set("assemblyId", String(assemblyId));
      fd.set("reset", "1");
      toleranceFetcher.submit(fd, { method: "post" });
    },
    [toleranceFetcher]
  );
  const acceptGapTargetProductId =
    acceptGapFetcher.state !== "idle"
      ? Number(acceptGapFetcher.formData?.get("productId"))
      : null;

  const atRiskRows = useMemo(() => {
    const rows = assemblies.slice();
    rows.sort((a, b) => {
      const lateDiff =
        Number(b.risk.hasExternalLate) - Number(a.risk.hasExternalLate);
      if (lateDiff !== 0) return lateDiff;
      const holdDiff = Number(b.risk.poHold) - Number(a.risk.poHold);
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
  }, [assemblies]);

  const vendorRows = useMemo(() => {
    return assemblies
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
  }, [assemblies]);

  const nextActionRows = useMemo(() => {
    const priority: Record<string, number> = {
      FOLLOW_UP_VENDOR: 0,
      RESOLVE_PO: 1,
      SEND_OUT: 2,
    };
    return assemblies
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
  }, [assemblies]);

  const materialsShortRows = useMemo(() => {
    return assemblies
      .flatMap((assembly) =>
        (assembly.materialCoverage?.materials || [])
          .filter((material) => (material.qtyUncovered ?? 0) > 0)
          .map((material) => ({ assembly, material }))
      )
      .sort((a, b) => {
        const diff = (b.material.qtyUncovered ?? 0) - (a.material.qtyUncovered ?? 0);
        if (diff !== 0) return diff;
        return a.assembly.id - b.assembly.id;
      });
  }, [assemblies]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <BreadcrumbSet
          breadcrumbs={[
            { label: "Production Dashboard", href: "/production/dashboard" },
          ]}
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
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab(value || "at-risk")}
      >
        <Tabs.List>
          <Tabs.Tab value="at-risk">At Risk</Tabs.Tab>
          <Tabs.Tab value="vendor">Out at Vendor</Tabs.Tab>
          <Tabs.Tab value="actions">Needs Action</Tabs.Tab>
          <Tabs.Tab value="materials">Materials Short</Tabs.Tab>
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
                  <Table.Th>Status</Table.Th>
                  <Table.Th>External step</Table.Th>
                  <Table.Th>External ETA</Table.Th>
                  <Table.Th>PO Hold</Table.Th>
                  <Table.Th>PO ETA</Table.Th>
                  <Table.Th>Target date</Table.Th>
                  <Table.Th>Ready to pack</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {atRiskRows.map((row) => {
                  const potentialCount = countPotentialMaterials(
                    row.materialCoverage
                  );
                  return (
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
                    <Table.Td>{row.status || "—"}</Table.Td>
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
                      <Stack gap={4}>
                        {row.risk.poHold ? (
                          <Stack gap={2}>
                            <Badge
                              color="yellow"
                              variant="filled"
                              size="sm"
                              style={{ cursor: "pointer" }}
                              onClick={() => setPoHoldFocus(row)}
                            >
                              PO HOLD{" "}
                              {countBlockingMaterials(row.materialCoverage) ||
                                ""}
                            </Badge>
                            <Text size="xs" c="dimmed">
                              {row.risk.poHoldReason || "Blocking PO line"}
                            </Text>
                          </Stack>
                        ) : null}
                        {potentialCount ? (
                          <Tooltip label="Uncovered gap within tolerance">
                            <Badge
                              color="gray"
                              variant="light"
                              size="sm"
                              style={{ cursor: "pointer" }}
                              onClick={() => setPoHoldFocus(row)}
                            >
                              Within tolerance {potentialCount}
                            </Badge>
                          </Tooltip>
                        ) : null}
                        {!row.risk.poHold && !potentialCount ? (
                          <Text size="sm">—</Text>
                        ) : null}
                      </Stack>
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
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setPoHoldFocus(row)}
                      >
                        Details
                      </Button>
                      {row.materialCoverage?.materials?.length ? (
                        <Button
                          size="xs"
                          variant="subtle"
                          ml="xs"
                          onClick={() => {
                            const mat =
                              row.materialCoverage?.materials.find(
                                (m) => (m.qtyUncovered ?? 0) > 0
                              ) ||
                              row.materialCoverage?.materials[0];
                            if (mat) {
                              setAssignTarget({
                                assembly: row,
                                productId: mat.productId,
                                productName: mat.productName,
                                uncovered: mat.qtyUncovered ?? 0,
                              });
                            }
                          }}
                        >
                          Assign to PO
                        </Button>
                      ) : null}
                    </Table.Td>
                    </Table.Tr>
                  );
                })}
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
                    key={`${assembly.id}-${step.stepLabel}-${
                      step.etaDate ?? "na"
                    }-${step.vendorName ?? "none"}`}
                  >
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
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
                        <Stack gap={0}>
                          <Link to={`/jobs/${assembly.job.id}`}>
                            {formatJobLabel(assembly.job)}
                          </Link>
                          <Text size="xs" c="dimmed">
                            {assembly.job?.customerName || "—"}
                          </Text>
                        </Stack>
                      ) : (
                        "—"
                      )}
                    </Table.Td>
                    <Table.Td>{step.stepLabel}</Table.Td>
                    <Table.Td>{step.vendorName || "Pending"}</Table.Td>
                    <Table.Td>{formatDate(step.etaDate)}</Table.Td>
                    <Table.Td>
                      {step.etaSource
                        ? LEAD_TIME_SOURCE_LABELS[step.etaSource] ||
                          step.etaSource
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
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
                            A{assembly.id} –{" "}
                            {assembly.name || assembly.productName || "—"}
                          </Link>
                        ) : (
                          <Text fw={600}>
                            A{assembly.id} –{" "}
                            {assembly.name || assembly.productName || "—"}
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

        <Tabs.Panel value="materials" pt="md">
          <Card withBorder padding="md">
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Assembly</Table.Th>
                  <Table.Th>Material</Table.Th>
                  <Table.Th>Required</Table.Th>
                  <Table.Th>Reserved (PO / Batch)</Table.Th>
                  <Table.Th>Uncovered</Table.Th>
                  <Table.Th>ETA</Table.Th>
                  <Table.Th></Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {materialsShortRows.map(({ assembly, material }) => (
                  <Table.Tr key={`${assembly.id}-${material.productId}`}>
                    <Table.Td>
                      <Stack gap={0}>
                        {assembly.job ? (
                          <Link
                            to={`/jobs/${assembly.job.id}/assembly/${assembly.id}`}
                          >
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
                      <Stack gap={2}>
                        <Text size="sm">
                          {material.productName ??
                            `Product ${material.productId}`}
                        </Text>
                        <Text size="xs" c="dimmed">
                          Reserved: PO {formatQuantity(material.qtyReservedToPo)} •
                          Batch {formatQuantity(material.qtyReservedToBatch)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {material.qtyRequired != null
                        ? formatQuantity(material.qtyRequired)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      {formatQuantity(material.qtyReservedToPo)} /{" "}
                      {formatQuantity(material.qtyReservedToBatch)}
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={2}>
                        {material.status === "PO_HOLD" ? (
                          <Badge color="red" size="sm">
                            Hold {formatQuantity(material.qtyUncoveredAfterTolerance)}
                          </Badge>
                        ) : material.status === "POTENTIAL_UNDERCUT" ? (
                          <Tooltip
                            label={`Raw ${formatQuantity(
                              material.qtyUncovered
                            )} · Tol ${formatQuantity(
                              material.tolerance.qty
                            )} (${getToleranceSourceLabel(
                              material.tolerance.source
                            )})`}
                          >
                            <Badge color="gray" size="sm" variant="light">
                              Within tolerance
                            </Badge>
                          </Tooltip>
                        ) : (
                          <Badge color="green" size="sm">
                            Covered
                          </Badge>
                        )}
                        <Text size="xs" c="dimmed">
                          Raw {formatQuantity(material.qtyUncovered)} · Tol{" "}
                          {formatQuantity(material.tolerance.qty)} → Eff{" "}
                          {formatQuantity(material.qtyUncoveredAfterTolerance)}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      {material.earliestEta
                        ? formatDate(material.earliestEta)
                        : "—"}
                    </Table.Td>
                    <Table.Td>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => setPoHoldFocus(assembly)}
                      >
                        View
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            {!materialsShortRows.length ? (
              <Group justify="center" py="md">
                <Text c="dimmed">No material shortages detected.</Text>
              </Group>
            ) : null}
          </Card>
        </Tabs.Panel>
      </Tabs>

      <Drawer
        opened={!!poHoldFocus}
        onClose={() => setPoHoldFocus(null)}
        title="PO Hold details"
        position="right"
        size="lg"
      >
        {poHoldFocus ? (
          <MaterialCoverageDetails
            assemblyId={poHoldFocus.id}
            coverage={poHoldFocus.materialCoverage}
            toleranceDefaults={toleranceDefaults}
            toleranceAbs={poHoldFocus.materialCoverageToleranceAbs}
            tolerancePct={poHoldFocus.materialCoverageTolerancePct}
            onAcceptGap={handleAcceptGap}
            acceptingProductId={acceptGapTargetProductId}
            onUpdateTolerance={handleToleranceSave}
            onResetTolerance={handleToleranceReset}
            toleranceSaving={toleranceFetcher.state !== "idle"}
          />
        ) : null}
      </Drawer>

      <AssignToPoModal
        target={assignTarget}
        onClose={() => setAssignTarget(null)}
        onSubmit={handleAssignSubmit}
        submitting={assignFetcher.state !== "idle"}
      />
    </Stack>
  );
}

function getTargetDate(assembly: LoaderAssembly) {
  const raw = assembly.job?.targetDate || assembly.job?.dropDeadDate;
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function countBlockingMaterials(
  coverage: LoaderAssembly["materialCoverage"]
): number {
  if (!coverage) return 0;
  return coverage.materials.filter(
    (material) =>
      material.status === "PO_HOLD" || material.blockingPoLineIds.length > 0
  ).length;
}

function countPotentialMaterials(
  coverage: LoaderAssembly["materialCoverage"]
): number {
  if (!coverage) return 0;
  return coverage.materials.filter(
    (material) => material.status === "POTENTIAL_UNDERCUT"
  ).length;
}

function AssignToPoModal({
  target,
  onClose,
  onSubmit,
  submitting,
}: {
  target: {
    assembly: LoaderAssembly;
    productId: number;
    productName: string | null;
    uncovered: number;
  } | null;
  onClose: () => void;
  onSubmit: (poLineId: number, qty: number) => void;
  submitting: boolean;
}) {
  const [poLineId, setPoLineId] = useState<number | null>(null);
  const [qty, setQty] = useState<number>(0);

  useEffect(() => {
    if (target) {
      setQty(target.uncovered || 0);
      setPoLineId(null);
    }
  }, [target]);
  const computeRemaining = useCallback((line: any) => {
    if (!line) return 0;
    const ordered = Number(line.qtyOrdered || 0) || 0;
    const received = Number(line.qtyReceived || 0) || 0;
    const reserved = Number(line.reservedQty || 0) || 0;
    if (line.availableQty != null && Number.isFinite(line.availableQty)) {
      return Math.max(Number(line.availableQty) || 0, 0);
    }
    return Math.max(ordered - received - reserved, 0);
  }, []);

  useEffect(() => {
    if (!poLineId) return;
    if (!target) return;
    const line = (target.assembly.poLines || []).find(
      (l: any) => l.id === poLineId
    );
    if (!line) return;
    const remaining = computeRemaining(line);
    setQty((prev) => {
      const safePrev = Number(prev || 0);
      if (!Number.isFinite(safePrev) || safePrev <= 0) {
        return remaining || 0;
      }
      return Math.min(safePrev, remaining || 0);
    });
  }, [poLineId, target, computeRemaining]);

  if (!target) return null;
  const { assembly, productId, productName, uncovered } = target;
  const options =
    (assembly.poLines || []).filter(
      (line) =>
        (line.productId ?? null) === productId &&
        computeRemaining(line) > 0
    ) || [];
  const selectedLine = options.find((line) => line.id === poLineId) || null;
  const remainingForSelected = selectedLine
    ? computeRemaining(selectedLine)
    : null;

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={`Assign to PO – A${assembly.id}`}
      centered
    >
      <Stack gap="sm">
        <Text size="sm">
          {productName ?? `Product ${productId}`} – Uncovered{" "}
          {formatQuantity(uncovered)}
        </Text>
        <NativeSelect
          label="PO line"
          value={poLineId ? String(poLineId) : ""}
          onChange={(e) => {
            const val = Number(e.currentTarget.value);
            setPoLineId(Number.isFinite(val) ? val : null);
          }}
          data={[
            { value: "", label: "Select a PO line" },
            ...options.map((line) => ({
              value: String(line.id),
              label: `PO#${line.purchaseOrderId ?? line.id} • Remaining ${formatQuantity(
                computeRemaining(line)
              )} • Reserved ${formatQuantity(line.reservedQty ?? 0)} • ETA ${formatDate(
                line.etaDate
              )}`,
            })),
          ]}
        />
        {remainingForSelected != null ? (
          <Text size="xs" c="dimmed">
            Available qty: {formatQuantity(remainingForSelected)}
          </Text>
        ) : null}
        <TextInput
          label="Quantity to reserve"
          value={qty}
          onChange={(e) => setQty(Number(e.currentTarget.value) || 0)}
          type="number"
          min={0}
          step="any"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!poLineId || qty <= 0}
            onClick={() => {
              if (!poLineId || qty <= 0) return;
              onSubmit(poLineId, qty);
            }}
            loading={submitting}
          >
            Assign
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

async function resolveUserLabel(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, firstName: true, lastName: true },
  });
  const display =
    user?.name ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return display || user?.email || `user:${userId}`;
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "0";
  return `${Math.round(Number(value) * 100) / 100}`;
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

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "0%";
  const num = Number(value) * 100;
  return `${Math.round(num * 10) / 10}%`;
}

function getToleranceSourceLabel(source: string | null | undefined) {
  switch (source) {
    case "ASSEMBLY":
      return "Assembly override";
    case "GLOBAL_TYPE":
      return "Global (type)";
    case "GLOBAL_DEFAULT":
    default:
      return "Global default";
  }
}

function stepTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}
