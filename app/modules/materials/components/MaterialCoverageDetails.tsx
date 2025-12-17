import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import type { AssemblyMaterialCoverage } from "~/modules/production/services/materialCoverage.server";
import type { CoverageToleranceDefaults } from "~/modules/materials/services/coverageTolerance.server";

export type MaterialCoverageDetailsProps = {
  assemblyId: number;
  coverage: AssemblyMaterialCoverage | null;
  toleranceDefaults: CoverageToleranceDefaults;
  toleranceAbs: number | null | undefined;
  tolerancePct: number | null | undefined;
  onAcceptGap?: (assemblyId: number, productId: number) => void;
  acceptingProductId?: number | null;
  onTrimReservations?: (lineId: number) => void;
  trimmingLineId?: number | null;
  onSettleReservations?: (
    assemblyId: number,
    productId: number,
    note: string | null
  ) => void;
  settlingProductId?: number | null;
  onUpdateTolerance?: (
    assemblyId: number,
    abs: number | null,
    pct: number | null
  ) => void;
  onResetTolerance?: (assemblyId: number) => void;
  toleranceSaving?: boolean;
  readOnly?: boolean;
};

export function MaterialCoverageDetails({
  assemblyId,
  coverage,
  toleranceDefaults,
  toleranceAbs,
  tolerancePct,
  onAcceptGap,
  acceptingProductId,
  onTrimReservations,
  trimmingLineId,
  onSettleReservations,
  settlingProductId,
  onUpdateTolerance,
  onResetTolerance,
  toleranceSaving,
  readOnly,
}: MaterialCoverageDetailsProps) {
  const [showToleranceControl, setShowToleranceControl] = useState(false);
  const [localAbs, setLocalAbs] = useState<string>("");
  const [localPct, setLocalPct] = useState<string>("");
  const [settleNotes, setSettleNotes] = useState<Record<number, string>>({});
  useEffect(() => {
    setLocalAbs(
      toleranceAbs != null ? String(Number(toleranceAbs) || 0) : ""
    );
    setLocalPct(
      tolerancePct != null
        ? String(Math.round(Number(tolerancePct) * 10000) / 100)
        : ""
    );
    setShowToleranceControl(false);
    setSettleNotes({});
  }, [assemblyId, toleranceAbs, tolerancePct]);

  if (!coverage) {
    return <Text c="dimmed">No material coverage data loaded.</Text>;
  }

  const hasOverride = toleranceAbs != null || tolerancePct != null;
  const toleranceSummary = [
    `Default ${formatPercent(toleranceDefaults.defaultPct)} / ${formatQuantity(
      toleranceDefaults.defaultAbs
    )}`,
    ...Object.entries(toleranceDefaults.byType || {}).map(
      ([type, entry]) =>
        `${type}: ${formatPercent(entry.pct)} / ${formatQuantity(entry.abs)}`
    ),
  ].join(" • ");

  const handleSaveTolerance = () => {
    if (!onUpdateTolerance) return;
    const absVal =
      localAbs.trim() === "" ? null : Math.max(Number(localAbs) || 0, 0);
    const pctVal =
      localPct.trim() === ""
        ? null
        : Math.max((Number(localPct) || 0) / 100, 0);
    onUpdateTolerance(assemblyId, absVal, pctVal);
  };

  const hasActiveDemand = coverage.materials.some(
    (material) => (material.qtyRequired ?? 0) > 0
  );

  return (
    <Stack gap="sm">
      <Card withBorder padding="sm">
        <Group justify="space-between" align="center">
          <Stack gap={2}>
            <Text fw={600}>Coverage tolerance</Text>
            <Text size="xs" c="dimmed">
              {hasOverride
                ? `Override: ${formatPercent(
                    tolerancePct ?? null
                  )} / ${formatQuantity(toleranceAbs)}`
                : "Using global defaults"}
            </Text>
            <Text size="xs" c="dimmed">
              {toleranceSummary}
            </Text>
          </Stack>
          {onUpdateTolerance ? (
            <Button
              size="xs"
              variant="subtle"
              onClick={() => setShowToleranceControl((prev) => !prev)}
            >
              {showToleranceControl ? "Hide controls" : "Adjust"}
            </Button>
          ) : null}
        </Group>
        {onUpdateTolerance ? (
          <Collapse in={showToleranceControl}>
            <Stack gap="xs" mt="sm">
              <Group gap="sm" align="flex-end">
                <TextInput
                  label="Abs tolerance"
                  description="Absolute qty buffer"
                  value={localAbs}
                  onChange={(e) => setLocalAbs(e.currentTarget.value)}
                  type="number"
                  min={0}
                  step="any"
                  style={{ flex: 1 }}
                />
                <TextInput
                  label="Percent tolerance"
                  description="Enter 3 for 3%"
                  value={localPct}
                  onChange={(e) => setLocalPct(e.currentTarget.value)}
                  type="number"
                  min={0}
                  step="any"
                  style={{ flex: 1 }}
                />
              </Group>
              <Group justify="flex-end">
                {onResetTolerance ? (
                  <Button
                    variant="default"
                    onClick={() => {
                      setLocalAbs("");
                      setLocalPct("");
                      onResetTolerance(assemblyId);
                    }}
                    loading={toleranceSaving}
                  >
                    Reset to global
                  </Button>
                ) : null}
                <Button onClick={handleSaveTolerance} loading={toleranceSaving}>
                  Save
                </Button>
              </Group>
            </Stack>
          </Collapse>
        ) : null}
      </Card>
      {coverage.reasons.length ? (
        <Text size="sm" c="dimmed">
          {coverage.reasons[0]?.message}
        </Text>
      ) : null}
      {!hasActiveDemand ? (
        <Text size="sm" c="dimmed">
          No active material demand. Any linked reservations will appear below as
          history.
        </Text>
      ) : null}
      {coverage.materials.map((material) => {
        const isDemandSettled = (material.qtyRequired ?? 0) <= 0;
        const activeReservations = material.reservations.filter(
          (res) => !res.settledAt
        );
        const overReservedLines = collectOverReservedLines(activeReservations);
        const blockedLines = collectBlockedLines(activeReservations);
        const showWarningBanner =
          overReservedLines.length > 0 || blockedLines.length > 0;
        const canSettle =
          !readOnly &&
          Boolean(onSettleReservations) &&
          isDemandSettled &&
          activeReservations.length > 0;
        const settleNote = settleNotes[material.productId] ?? "";
        const isSettling = settlingProductId === material.productId;
        const bannerColor = overReservedLines.length
          ? "red"
          : blockedLines.length
          ? "yellow"
          : "gray";
        const bannerTitle =
          overReservedLines.length || blockedLines.length
            ? "Supply warnings"
            : "Reservations";

        return (
          <Card
            key={`${assemblyId}-${material.productId}`}
            withBorder
            padding="sm"
          >
          <Stack gap="xs">
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={600}>
                  {material.productName ?? `Product ${material.productId}`}
                </Text>
                <Text size="xs" c="dimmed">
                  Required {formatQuantity(material.qtyRequired ?? 0)} · On hand {" "}
                  {formatQuantity(material.locStock)} (loc) / {" "}
                  {formatQuantity(material.totalStock)} (total) · PO {" "}
                  {formatQuantity(material.qtyReservedToPo)} · Batch {" "}
                  {formatQuantity(material.qtyReservedToBatch)}
                </Text>
                <Text size="xs" c="dimmed">
                  Raw uncovered {formatQuantity(material.qtyUncovered)} · Tol {" "}
                  {formatQuantity(material.tolerance.qty)} ({formatPercent(
                    material.tolerance.pct
                  )} / abs {formatQuantity(material.tolerance.abs)}) → Effective {" "}
                  {formatQuantity(material.qtyUncoveredAfterTolerance)} · Source {" "}
                  {getToleranceSourceLabel(material.tolerance.source)}
                </Text>
              </Stack>
              <Group gap="xs">
                {isDemandSettled ? (
                  <Badge color="gray" size="sm" variant="light">
                    Settled
                  </Badge>
                ) : null}
                {isDemandSettled
                  ? null
                  : material.status === "PO_HOLD" ? (
                      <Badge color="red" size="sm">
                        Uncovered{" "}
                        {formatQuantity(material.qtyUncoveredAfterTolerance)}
                      </Badge>
                    ) : material.blockingPoLineIds.length ? (
                      <Badge color="yellow" size="sm">
                        ETA blocked
                      </Badge>
                    ) : material.status === "DUE_SOON" ? (
                      <Badge color="yellow" size="sm" variant="light">
                        Due soon
                      </Badge>
                    ) : material.status === "POTENTIAL_UNDERCUT" ? (
                      <Tooltip
                        label={`Raw ${formatQuantity(
                          material.qtyUncovered
                        )} within tolerance ${formatQuantity(
                          material.tolerance.qty
                        )}`}
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
                {onAcceptGap && !readOnly &&
                material.status === "PO_HOLD" &&
                material.qtyUncovered > 0 &&
                (material.qtyRequired ?? 0) > 0 ? (
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => onAcceptGap(assemblyId, material.productId)}
                    loading={acceptingProductId === material.productId}
                  >
                    Accept gap
                  </Button>
                ) : null}
              </Group>
            </Group>
            {showWarningBanner || canSettle ? (
              <Alert color={bannerColor} title={bannerTitle} variant="light">
                <Stack gap="xs">
                  {(overReservedLines.length || blockedLines.length) ? (
                    <Stack gap={4}>
                      {overReservedLines.length ? (
                        <Badge color="red" size="sm">
                          OVER-RESERVED
                        </Badge>
                      ) : null}
                      {blockedLines.length ? (
                        <Badge color="yellow" size="sm">
                          ETA BLOCKED
                        </Badge>
                      ) : null}
                    </Stack>
                  ) : null}
                  {overReservedLines.map((line) => (
                    <Stack key={`over-${line.lineId}`} gap={4}>
                      <Group justify="space-between" align="center">
                        <Text size="sm">
                          OVER-RESERVED: Reserved{" "}
                          {formatMaybeQuantity(line.reserved)} &gt; Expected{" "}
                          {formatMaybeQuantity(line.expected)} (+
                      {formatQuantity(line.overReserved)}) on{" "}
                      {formatPoLineLabel(line.purchaseOrderId, line.lineId)}.
                        </Text>
                        {onTrimReservations && !readOnly ? (
                          <Button
                            size="xs"
                            variant="light"
                            onClick={() => onTrimReservations(line.lineId)}
                            loading={trimmingLineId === line.lineId}
                          >
                            Trim reservations
                          </Button>
                        ) : null}
                      </Group>
                      {onTrimReservations && !readOnly ? (
                        <Text size="xs" c="dimmed">
                          Will trim {formatQuantity(line.overReserved)} from
                          newest reservations first.
                        </Text>
                      ) : null}
                    </Stack>
                  ))}
                  {blockedLines.map((line) => (
                    <Text size="sm" key={`blocked-${line.lineId}`}>
                      ETA BLOCKED: {line.reason ?? "ETA blocked"} on unreceived
                      expected supply (
                      {formatMaybeQuantity(
                        line.unreceivedExpected ?? line.expected
                      )}
                      ) on {formatPoLineLabel(line.purchaseOrderId, line.lineId)}
                    </Text>
                  ))}
                  {canSettle ? (
                    <Stack gap="xs">
                      <Text size="sm">
                        No active demand. Move reservations into history.
                      </Text>
                      <Group gap="sm" align="flex-end">
                        <TextInput
                          label="Settle note (optional)"
                          placeholder="Reason for settling"
                          value={settleNote}
                          onChange={(e) =>
                            setSettleNotes((prev) => ({
                              ...prev,
                              [material.productId]: e.currentTarget.value,
                            }))
                          }
                          style={{ flex: 1 }}
                        />
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() =>
                            onSettleReservations?.(
                              assemblyId,
                              material.productId,
                              settleNote.trim() || null
                            )
                          }
                          loading={isSettling}
                        >
                          Settle reservations
                        </Button>
                      </Group>
                    </Stack>
                  ) : null}
                </Stack>
              </Alert>
            ) : null}
            {material.calc ? (
              <Text size="xs" c="dimmed">
                Calc: order {formatQuantity(material.calc.orderQty ?? 0)} · cut {" "}
                {formatQuantity(material.calc.cutGoodQty ?? 0)} · remaining to cut {" "}
                {formatQuantity(material.calc.remainingToCut ?? 0)} · qty/unit {" "}
                {formatQuantity(material.calc.qtyPerUnit ?? 0)} → required {" "}
                {formatQuantity(material.qtyRequired ?? 0)}
                {material.calc.statusHint ? ` (${material.calc.statusHint})` : ""}
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
                    {formatQuantity(material.locStock)} / {" "}
                    {formatQuantity(material.totalStock)}
                  </Table.Td>
                  <Table.Td>
                    On-hand {formatQuantity(material.coveredByOnHand)} · Res {" "}
                    {formatQuantity(material.coveredByReservations)}
                  </Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>—</Table.Td>
                  <Table.Td>—</Table.Td>
                </Table.Tr>
                {material.reservations.map((res) => {
                  const isRowSettled = isDemandSettled || Boolean(res.settledAt);
                  const hasPoDetails =
                    res.type === "PO" &&
                    (res.qtyExpected != null ||
                      res.reservedTotal != null ||
                      res.unreceivedExpected != null);
                  const overage =
                    res.overReserved != null && res.overReserved > 0
                      ? ` · Over +${formatQuantity(res.overReserved)}`
                      : "";
                  const poNote = hasPoDetails
                    ? `Expected ${formatMaybeQuantity(
                        res.qtyExpected
                      )} · Reserved ${formatMaybeQuantity(
                        res.reservedTotal
                      )} · Unreceived ${formatMaybeQuantity(
                        res.unreceivedExpected
                      )}${overage}`
                    : null;
                  return (
                    <Table.Tr key={res.id}>
                    <Table.Td>
                      {res.type === "PO"
                        ? formatPoLineLabel(
                            res.purchaseOrderId,
                            res.purchaseOrderLineId
                          )
                        : `Batch #${res.inventoryBatchId ?? "—"}`}
                    </Table.Td>
                    <Table.Td>{formatQuantity(res.qtyReserved)}</Table.Td>
                    <Table.Td>—</Table.Td>
                    <Table.Td>Res {formatQuantity(res.qtyReserved)}</Table.Td>
                    <Table.Td>{formatDate(res.etaDate)}</Table.Td>
                    <Table.Td>
                      {isRowSettled ? (
                        <Badge color="gray" size="sm" variant="light">
                          Settled
                        </Badge>
                      ) : res.status === "BLOCKED" ? (
                        <Badge color="yellow" size="sm">
                          {res.reason || "Blocked"}
                        </Badge>
                      ) : res.dueSoon ? (
                        <Badge color="yellow" size="sm" variant="light">
                          Due soon
                        </Badge>
                      ) : (
                        <Badge color="green" size="sm">
                          OK
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      <Text size="xs" c="dimmed">
                        {poNote || res.note || "—"}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>
        </Card>
        );
      })}
    </Stack>
  );
}

function formatQuantity(value: number | null | undefined) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString();
}

function formatMaybeQuantity(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const num = Number(value);
  return num.toLocaleString();
}

function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "0%";
  const num = Number(value) * 100;
  return `${Math.round(num * 10) / 10}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

type ReservationRow =
  AssemblyMaterialCoverage["materials"][number]["reservations"][number];

type OverReservedLine = {
  lineId: number;
  purchaseOrderId: number | null;
  expected: number | null;
  reserved: number | null;
  overReserved: number;
};

type BlockedLine = {
  lineId: number;
  purchaseOrderId: number | null;
  reason: string | null;
  unreceivedExpected: number | null;
  expected: number | null;
};

function collectOverReservedLines(
  reservations: ReservationRow[]
): OverReservedLine[] {
  const map = new Map<number, OverReservedLine>();
  reservations.forEach((res) => {
    if (res.type !== "PO" || !res.purchaseOrderLineId) return;
    const overReserved = Number(res.overReserved ?? 0) || 0;
    if (overReserved <= 0) return;
    const lineId = res.purchaseOrderLineId;
    const purchaseOrderId = res.purchaseOrderId ?? null;
    const expected =
      res.qtyExpected != null ? Number(res.qtyExpected) : null;
    const reserved =
      res.reservedTotal != null
        ? Number(res.reservedTotal)
        : expected != null
        ? expected + overReserved
        : null;
    const prior = map.get(lineId);
    if (!prior || overReserved > prior.overReserved) {
      map.set(lineId, {
        lineId,
        purchaseOrderId,
        expected,
        reserved,
        overReserved,
      });
    }
  });
  return Array.from(map.values());
}

function collectBlockedLines(reservations: ReservationRow[]): BlockedLine[] {
  const map = new Map<number, BlockedLine>();
  reservations.forEach((res) => {
    if (
      res.type !== "PO" ||
      !res.purchaseOrderLineId ||
      res.status !== "BLOCKED"
    )
      return;
    if (!map.has(res.purchaseOrderLineId)) {
      map.set(res.purchaseOrderLineId, {
        lineId: res.purchaseOrderLineId,
        purchaseOrderId: res.purchaseOrderId ?? null,
        reason: res.reason ?? null,
        unreceivedExpected:
          res.unreceivedExpected != null
            ? Number(res.unreceivedExpected)
            : null,
        expected: res.qtyExpected != null ? Number(res.qtyExpected) : null,
      });
    }
  });
  return Array.from(map.values());
}

function formatPoLineLabel(
  purchaseOrderId: number | null | undefined,
  lineId: number | null | undefined
) {
  if (purchaseOrderId && lineId) return `PO #${purchaseOrderId}, Line #${lineId}`;
  if (lineId) return `PO line #${lineId}`;
  if (purchaseOrderId) return `PO #${purchaseOrderId}`;
  return "PO line";
}
