import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import { Link, useFetcher, useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Modal,
  TextInput,
  NativeSelect,
  Group,
  Stack,
  Table,
  Tabs,
  Text,
} from "@mantine/core";
import { useMemo, useState, useCallback, useEffect } from "react";
import { BreadcrumbSet } from "@aa/timber";
import { requireUserId } from "~/utils/auth.server";
import { useRegisterNavLocation } from "~/hooks/useNavLocation";
import type {
  LoaderAssembly,
  LoaderData,
} from "~/modules/production/services/production.dashboard.server";
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
  await requireUserId(request);
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
    const remaining = Math.max(qtyOrdered - qtyReceived, 0);
    const reserveQty = Math.min(qty, remaining || qty);
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
  return json({ ok: false }, { status: 400 });
}

export default function ProductionDashboardRoute() {
  const data = useLoaderData<LoaderData>();
  const assemblies = Array.isArray(data?.assemblies) ? data.assemblies : [];
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
  const navigate = useNavigate();
  useRegisterNavLocation({ moduleKey: "production-dashboard" });

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
                            {countBlockingMaterials(row.materialCoverage) || ""}
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
                      <Badge color="red" size="sm">
                        {formatQuantity(material.qtyUncovered)}
                      </Badge>
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
          <MaterialCoverageDetails assembly={poHoldFocus} />
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

function MaterialCoverageDetails({ assembly }: { assembly: LoaderAssembly }) {
  const coverage = assembly.materialCoverage;
  if (!coverage) {
    return <Text c="dimmed">No material coverage data loaded.</Text>;
  }
  if (!coverage.materials.length) {
    return <Text c="dimmed">No material demand or reservations recorded.</Text>;
  }
  return (
    <Stack gap="sm">
      {coverage.reasons.length ? (
        <Text size="sm" c="dimmed">
          {coverage.reasons[0]?.message}
        </Text>
      ) : null}
      {coverage.materials.map((material) => (
        <Card key={`${assembly.id}-${material.productId}`} withBorder padding="sm">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text fw={600}>
                  {material.productName ??
                    `Product ${material.productId}`}
                </Text>
                <Text size="xs" c="dimmed">
                  Required {formatQuantity(material.qtyRequired ?? 0)} · On hand{" "}
                  {formatQuantity(material.locStock)} (loc) /{" "}
                  {formatQuantity(material.totalStock)} (total) · PO{" "}
                  {formatQuantity(material.qtyReservedToPo)} · Batch{" "}
                  {formatQuantity(material.qtyReservedToBatch)}
                </Text>
              </Stack>
              {material.qtyUncovered > 0 ? (
                <Badge color="red" size="sm">
                  Uncovered {formatQuantity(material.qtyUncovered)}
                </Badge>
              ) : material.blockingPoLineIds.length ? (
                <Badge color="yellow" size="sm">
                  ETA blocked
                </Badge>
              ) : (
                <Badge color="green" size="sm">
                  Covered
                </Badge>
              )}
            </Group>
            {material.calc ? (
              <Text size="xs" c="dimmed">
                Calc: order {formatQuantity(material.calc.orderQty ?? 0)} · cut{" "}
                {formatQuantity(material.calc.cutGoodQty ?? 0)} · remaining to
                cut {formatQuantity(material.calc.remainingToCut ?? 0)} · qty/unit{" "}
                {formatQuantity(material.calc.qtyPerUnit ?? 0)} → required{" "}
                {formatQuantity(material.qtyRequired ?? 0)}
                {material.calc.statusHint
                  ? ` (${material.calc.statusHint})`
                  : ""}
              </Text>
            ) : null}
            <Table
              highlightOnHover
              horizontalSpacing="sm"
              verticalSpacing="xs"
              withColumnBorders
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Source</Table.Th>
                  <Table.Th>Qty</Table.Th>
                  <Table.Th>On hand</Table.Th>
                  <Table.Th>Covered</Table.Th>
                  <Table.Th>ETA</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Notes</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Td>On hand (loc / total)</Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>
                    {formatQuantity(material.locStock)} /{" "}
                    {formatQuantity(material.totalStock)}
                  </Table.Td>
                  <Table.Td>
                    On-hand {formatQuantity(material.coveredByOnHand)} · Res{" "}
                    {formatQuantity(material.coveredByReservations)}
                  </Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>—</Table.Td>
                </Table.Tr>
                {material.reservations.map((res) => (
                  <Table.Tr key={res.id}>
                    <Table.Td>
                      {res.type === "PO"
                        ? `PO line #${res.purchaseOrderLineId ?? "—"}`
                        : `Batch #${res.inventoryBatchId ?? "—"}`}
                    </Table.Td>
                    <Table.Td>{formatQuantity(res.qtyReserved)}</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>Res {formatQuantity(res.qtyReserved)}</Table.Td>
                    <Table.Td>{formatDate(res.etaDate)}</Table.Td>
                    <Table.Td>
                      {res.status === "BLOCKED" ? (
                        <Badge color="yellow" size="sm">
                          {res.reason || "Blocked"}
                        </Badge>
                      ) : (
                        <Badge color="green" size="sm">
                          OK
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {res.note || "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
      ))}
    </Stack>
  );
}

function countBlockingMaterials(
  coverage: LoaderAssembly["materialCoverage"]
): number {
  if (!coverage) return 0;
  return coverage.materials.filter(
    (material) =>
      (material.qtyUncovered ?? 0) > 0 || material.blockingPoLineIds.length > 0
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

  if (!target) return null;
  const { assembly, productId, productName, uncovered } = target;
  const options =
    (assembly.poLines || []).filter(
      (line) =>
        (line.productId ?? null) === productId &&
        Math.max((line.qtyOrdered || 0) - (line.qtyReceived || 0), 0) > 0
    ) || [];

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
                Math.max((line.qtyOrdered || 0) - (line.qtyReceived || 0), 0)
              )} • ETA ${formatDate(line.etaDate)}`,
            })),
          ]}
        />
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

function stepTime(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}
