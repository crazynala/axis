import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Link } from "@remix-run/react";
import { AxisChip } from "~/components/AxisChip";
import { EmbeddedTextInput } from "~/components/EmbeddedTextInput";
import { useEffect, useMemo, useState } from "react";
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconBox,
  IconNeedle,
  IconScissors,
  IconSettings,
} from "@tabler/icons-react";
import type {
  ExternalStageRow,
  StageKey,
  StageRow,
} from "~/modules/job/types/stageRows";

const EXTERNAL_STATUS_LABELS: Record<ExternalStageRow["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "Sent out",
  DONE: "Received",
  IMPLICIT_DONE: "Implicit done",
};

const formatDateValue = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const padArray = (arr: number[] | undefined, len: number) =>
  Array.from({ length: len }, (_, i) => Number(arr?.[i] ?? 0) || 0);

const STAGE_LABELS: Record<string, string> = {
  order: "ORDER",
  cut: "CUT",
  sew: "SEW",
  wash: "WASH",
  embroidery: "EMBROIDERY",
  dye: "DYE",
  finish: "FINISH",
  pack: "PACK",
  retain: "RETAIN",
  qc: "QC",
};

function getStageLabelForRow(row: StageRow): string {
  if (row.kind === "internal")
    return STAGE_LABELS[row.stage] ?? row.stage.toUpperCase();
  const type = String(row.externalStepType || row.label || "").trim();
  if (!type) return "EXTERNAL";
  const normalized = type.toLowerCase();
  return STAGE_LABELS[normalized] ?? type.toUpperCase();
}

const buildLegacyRows = (item: SingleQuantities): StageRow[] => {
  const sumArr = (arr: number[] | undefined) =>
    (arr || []).reduce((total, value) => total + (Number(value) || 0), 0);
  const makeRow = (
    stage: StageKey,
    label: string,
    breakdown: number[],
    total: number
  ): StageRow => ({
    kind: "internal",
    stage,
    label,
    breakdown,
    total,
    loss: [],
    lossTotal: 0,
  });
  return [
    makeRow("order", "Ordered", item.ordered || [], sumArr(item.ordered)),
    makeRow("cut", "Cut", item.cut || [], item.totals.cut ?? sumArr(item.cut)),
    makeRow("sew", "Sew", item.sew || [], item.totals.sew ?? sumArr(item.sew)),
    makeRow(
      "finish",
      "Finish",
      item.finish || [],
      item.totals.finish ?? sumArr(item.finish)
    ),
    makeRow(
      item.showRetain ? "retain" : "pack",
      item.showRetain ? "Retain" : "Pack",
      item.showRetain ? item.retain || [] : item.pack || [],
      item.showRetain
        ? item.totals.retain ?? sumArr(item.retain || [])
        : item.totals.pack ?? sumArr(item.pack)
    ),
  ];
};

export type VariantInfo = {
  labels: string[];
  numVariants: number;
};

type SingleQuantities = {
  label: string;
  assemblyId: number;
  ordered: number[];
  canceled?: number[];
  cut: number[];
  sew: number[];
  finish: number[];
  pack: number[];
  retain?: number[];
  totals: { cut: number; sew: number; finish: number; pack: number; retain?: number };
  showRetain?: boolean;
  stageRows?: StageRow[];
  projectedStages?: { cut?: boolean; finish?: boolean; externalTypes?: string[] };
};

export function AssemblyQuantitiesCard({
  title = "Quantities",
  variants,
  items,
  editableOrdered = false,
  onSubmitOrdered,
  onCancelOrdered,
  orderedValue,
  onChangeOrdered,
  hideInlineActions,
  showOperationalSummary = false,
  holdByAssemblyId,
  actionColumn,
  onExternalSend,
  onExternalReceive,
  jobId,
  splitMetaByAssemblyId,
  splitParentByAssemblyId,
}: {
  title?: string;
  variants: VariantInfo;
  items: SingleQuantities[];
  /** Enable inline editing for the Ordered row (first item only is supported) */
  editableOrdered?: boolean;
  onSubmitOrdered?: (ordered: number[]) => void;
  onCancelOrdered?: () => void;
  /** Controlled ordered array; when provided, component becomes controlled */
  orderedValue?: number[];
  /** Change handler for controlled mode */
  onChangeOrdered?: (ordered: number[]) => void;
  /** Hide inline Save/Cancel buttons (use global form header instead) */
  hideInlineActions?: boolean;
  showOperationalSummary?: boolean;
  holdByAssemblyId?: Record<number, { jobHold: boolean; assemblyHold: boolean }>;
  actionColumn?: {
    onRecordCut?: () => void;
    onRecordSew?: () => void;
    recordSewDisabled?: boolean;
    onRecordFinish?: () => void;
    recordFinishDisabled?: boolean;
    onRecordPack?: () => void;
    recordPackDisabled?: boolean;
    onRecordRetain?: () => void;
    recordRetainDisabled?: boolean;
  };
  onExternalSend?: (assemblyId: number, row: ExternalStageRow) => void;
  onExternalReceive?: (assemblyId: number, row: ExternalStageRow) => void;
  jobId?: number;
  splitMetaByAssemblyId?: Record<
    number,
    {
      splitStageKey?: string;
      allocatedBreakdown?: number[];
      totalAllocated?: number;
      parentRemainder?: number;
      childAssemblyIds?: number[];
    }
  >;
  splitParentByAssemblyId?: Record<number, number>;
}) {
  const fmtNum = (n: number | undefined) =>
    n === undefined || n === null || !Number.isFinite(n) || n === 0
      ? ""
      : String(n);
  const fmtEta = (value: string | null | undefined) =>
    formatDateValue(value) ?? (value ? value : "");
  const hasInternalActions = Boolean(
    actionColumn &&
      (actionColumn.onRecordCut ||
        actionColumn.onRecordSew ||
        actionColumn.onRecordFinish ||
        actionColumn.onRecordPack ||
        actionColumn.onRecordRetain)
  );
  const rawLabels = variants.labels;
  // Determine if labels include any non-empty values and where the last non-empty is
  const lastNonEmpty = (() => {
    let last = -1;
    for (let i = rawLabels.length - 1; i >= 0; i--) {
      const s = (rawLabels[i] || "").toString().trim();
      if (s) {
        last = i;
        break;
      }
    }
    return last;
  })();
  // Fallback to the longest data array length when labels and numVariants are not specified
  const dataMaxLen = (items || []).reduce((m, it) => {
    const rows =
      it.stageRows && it.stageRows.length ? it.stageRows : buildLegacyRows(it);
    const localMax = rows.reduce((inner, row) => {
      if (row.kind === "external") {
        return Math.max(
          inner,
          row.received.length,
          row.sent.length,
          row.loss.length
        );
      }
      return Math.max(inner, row.breakdown.length);
    }, 0);
    return Math.max(m, localMax);
  }, 0);
  // Prefer explicit numVariants when provided; else use labels length or data length fallback
  const baseLen =
    variants.numVariants > 0
      ? variants.numVariants
      : Math.max(rawLabels.length, dataMaxLen);
  // If we have at least one non-empty label, cap by the last non-empty index; otherwise keep baseLen
  const effectiveLen = Math.max(
    0,
    lastNonEmpty >= 0 ? Math.min(baseLen, lastNonEmpty + 1) : baseLen
  );
  const labelSlice = rawLabels.slice(0, effectiveLen);
  const cols = (
    labelSlice.some((s) => (s || "").toString().trim())
      ? labelSlice
      : Array.from({ length: effectiveLen }, (_, i) => `${i + 1}`)
  ) as string[];
  const sum = (arr: number[] | undefined) =>
    (arr || []).reduce(
      (t, n) => (Number.isFinite(n) ? t + (n as number) : t),
      0
    );

  // Inline edit state (only for first item). Keep local state so total updates live.
  const isControlled = Array.isArray(orderedValue);
  const [orderedDraft, setOrderedDraft] = useState<number[] | null>(
    editableOrdered && !isControlled && items[0]?.ordered
      ? [...items[0].ordered]
      : null
  );
  useEffect(() => {
    if (isControlled) return; // parent controls state
    if (editableOrdered)
      setOrderedDraft(items[0]?.ordered ? [...items[0].ordered] : []);
    else setOrderedDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableOrdered, items && items[0] && items[0].ordered?.join(",")]);

  const handleChangeCell = (idx: number, value: string) => {
    const v = value === "" ? 0 : Number(value);
    const updater = (srcArr: number[]) => {
      const next = [...srcArr];
      next[idx] = Number.isFinite(v) ? (v as number) | 0 : 0;
      return next;
    };
    if (isControlled && Array.isArray(orderedValue)) {
      const next = updater(orderedValue);
      onChangeOrdered?.(next);
    } else if (Array.isArray(orderedDraft)) {
      setOrderedDraft((prev) => updater(Array.isArray(prev) ? prev : []));
    }
  };

  const effectiveOrdered =
    editableOrdered &&
    (isControlled ? Array.isArray(orderedValue) : Array.isArray(orderedDraft))
      ? isControlled
        ? (orderedValue as number[])
        : (orderedDraft as number[])
      : items[0]?.ordered || [];

  const totalOrdered = useMemo(() => sum(effectiveOrdered), [effectiveOrdered]);

  const tableStyle: React.CSSProperties = {
    tableLayout: "fixed",
    // width: "max-content",
    minWidth: "100%",
  };
  const tdBase: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    verticalAlign: "middle",
    paddingTop: 6,
    paddingBottom: 6,
  };
  const tdCenter: React.CSSProperties = {
    ...tdBase,
    textAlign: "center",
  };
  const thCenter: React.CSSProperties = {
    textAlign: "center",
  };
  const colWidths = {
    stage: 100,
    total: 70,
    loss: 70,
    out: 70,
    eta: 90,
    status: "100%",
    act: 40,
    size: 50,
  };

  const sumArr = (arr: number[] | undefined) =>
    (arr || []).reduce((total, value) => total + (Number(value) || 0), 0);

  const getOperationalSummary = (item: SingleQuantities) => {
    const orderedTotal = sumArr(item.ordered);
    const canceledTotal = sumArr(item.canceled);
    const netToFulfill = Math.max(orderedTotal - canceledTotal, 0);
    const packedQty = item.showRetain
      ? typeof item.totals?.retain === "number"
        ? item.totals.retain
        : sumArr(item.retain || [])
      : typeof item.totals?.pack === "number"
        ? item.totals.pack
        : sumArr(item.pack);
    const remaining = Math.max(netToFulfill - packedQty, 0);
    const started =
      sumArr(item.cut) > 0 ||
      Boolean(
        item.stageRows?.some(
          (row) => row.kind === "external" && row.status === "IN_PROGRESS"
        )
      );
    const doneForProduction = netToFulfill > 0 && packedQty >= netToFulfill;
    return {
      netToFulfill,
      packedQty,
      remaining,
      started,
      doneForProduction,
    };
  };

  const getHoldSummary = (assemblyId: number) => {
    const hold = holdByAssemblyId?.[assemblyId];
    const jobHold = Boolean(hold?.jobHold);
    const assemblyHold = Boolean(hold?.assemblyHold);
    const effectiveHold = jobHold || assemblyHold;
    let source: "none" | "job" | "assembly" | "both" = "none";
    if (jobHold && assemblyHold) source = "both";
    else if (jobHold) source = "job";
    else if (assemblyHold) source = "assembly";
    return { effectiveHold, source };
  };

  type ChipTone = "warning" | "info" | "neutral";
  type ChipSpec = {
    key: string;
    tone: ChipTone;
    label: string;
    tooltip: string;
  };

  const renderAssemblyChip = (assemblyId: number, label?: string) => {
    const text = label || `A${assemblyId}`;
    if (!jobId) {
      return <AxisChip tone="neutral">{text}</AxisChip>;
    }
    return (
      <Link
        to={`/jobs/${jobId}/assembly/${assemblyId}`}
        style={{ textDecoration: "none" }}
      >
        <AxisChip tone="neutral">{text}</AxisChip>
      </Link>
    );
  };

  const collapseChips = (
    chips: ChipSpec[],
    maxVisible: number,
    overflowLabel: (n: number) => string
  ): ChipSpec[] => {
    if (chips.length <= maxVisible) return chips;
    const visible = chips.slice(0, maxVisible);
    const hidden = chips.slice(maxVisible);
    visible.push({
      key: `overflow-${visible.length}`,
      tone: "neutral",
      label: overflowLabel(hidden.length),
      tooltip: hidden.map((c) => c.label).join(" · "),
    });
    return visible;
  };

  const buildStatusChips = (
    assemblyId: number,
    row: StageRow,
    breakdownValues?: number[],
    rawBreakdown?: number[]
  ) => {
    const warnings: ChipSpec[] = [];
    const ops: ChipSpec[] = [];
    const extState: ChipSpec[] = [];
    const derived: ChipSpec[] = [];

    // Missing sizes: only for legacy ORDER cases:
    // total > 0 AND breakdown empty/null AND stage is ORDER (or order_adjust equivalents).
    if (row.kind === "internal") {
      const stageRaw = String(row.stage || "").toLowerCase();
      const isOrderStage = stageRaw === "order" || stageRaw === "order_adjust";
      const total = Number(row.total ?? 0) || 0;
      const rawLen = Array.isArray(rawBreakdown) ? rawBreakdown.length : 0;
      if (isOrderStage && total > 0 && rawLen === 0) {
        warnings.push({
          key: "missing-sizes",
          tone: "warning",
          label: "Missing sizes",
          tooltip:
            "Legacy order record: total exists but the size breakdown is empty.",
        });
      }

      const logged = Number((row as any).loggedDefectTotal ?? 0) || 0;
      if (logged > 0) {
        ops.push({
          key: "logged-defects",
          tone: "neutral",
          label: `Logged ${logged}`,
          tooltip: "Defects logged out-of-band (do not change counts).",
        });
      }
    }

    if (row.kind === "external") {
      if (row.status === "IMPLICIT_DONE") {
        derived.push({
          key: "derived",
          tone: "info",
          label: "Derived",
          tooltip: "This row is implied from downstream activity.",
        });
      }
      if (row.isLate) {
        ops.push({
          key: "late",
          tone: "warning",
          label: "Late",
          tooltip: "This step is past its ETA.",
        });
      }

      if (row.lowConfidence && row.status !== "IMPLICIT_DONE") {
        derived.push({
          key: "derived",
          tone: "info",
          label: "Derived",
          tooltip:
            "This row is marked low confidence due to inferred/backfilled data (e.g. Sew missing).",
        });
      }

      if (row.totals.loss > 0) {
        extState.push({
          key: "outstanding",
          tone: "neutral",
          label: `Out ${row.totals.loss}`,
          tooltip: "Outstanding units (sent - received).",
        });
      }

      // External step state chip is omitted when actions already communicate state.
      // Show it for IN_PROGRESS/DONE/IMPLICIT_DONE for clarity.
      if (row.status === "IN_PROGRESS" || row.status === "DONE") {
        extState.push({
          key: "ext-status",
          tone: "neutral",
          label: EXTERNAL_STATUS_LABELS[row.status],
          tooltip: "External step status.",
        });
      }
    }
    if (row.kind === "internal" && row.stage === "sew" && row.hint) {
      derived.push({
        key: "derived",
        tone: "info",
        label: "Derived",
        tooltip: row.hint,
      });
    }

    const orderedWarnings = warnings;
    const orderedOps = ops;
    const orderedExtState = extState.slice(0, 1);
    const orderedDerived = derived.slice(0, 1);
    const out: ChipSpec[] = [];
    out.push(...collapseChips(orderedWarnings, 2, (n) => `+${n}`));
    out.push(...collapseChips(orderedOps, 2, (n) => `+${n}`));
    out.push(...orderedExtState);
    out.push(...orderedDerived);
    return out;
  };

  return (
    <Card withBorder padding="md">
      <Card.Section>
        {items.map((it, idx) => (
          <div
            key={`q-${idx}`}
            style={{ marginBottom: idx < items.length - 1 ? 16 : 0 }}
          >
            {items.length > 1 && (
              <Group justify="space-between" mb="xs">
                <Title order={6}>{it.label}</Title>
              </Group>
            )}
            {showOperationalSummary ? (() => {
              const summary = getOperationalSummary(it);
              const holdSummary = getHoldSummary(it.assemblyId);
              const hasNoDemand = summary.netToFulfill === 0;
              const holdLabel =
                holdSummary.source === "both"
                  ? "Job + Assembly"
                  : holdSummary.source === "job"
                  ? "From Job"
                  : holdSummary.source === "assembly"
                  ? "On Assembly"
                  : null;
              return (
                <Group gap="xs" wrap="wrap" mb="xs" align="center">
                  <Badge size="sm" variant="light">
                    Net {summary.netToFulfill}
                  </Badge>
                  <Badge size="sm" variant="light">
                    {it.showRetain ? "Retained" : "Packed"} {summary.packedQty}
                  </Badge>
                  <Badge size="sm" variant="light">
                    Remaining {summary.remaining}
                  </Badge>
                  {summary.started ? (
                    <Badge size="sm" variant="light" color="blue">
                      Started
                    </Badge>
                  ) : null}
                  {summary.doneForProduction ? (
                    <Badge size="sm" variant="light" color="green">
                      Done for production
                    </Badge>
                  ) : null}
                  {holdSummary.effectiveHold ? (
                    <Group gap={6} wrap="nowrap">
                      <Badge size="sm" color="orange" variant="light">
                        Held
                      </Badge>
                      {holdLabel ? (
                        <Text size="xs" c="dimmed">
                          {holdLabel}
                        </Text>
                      ) : null}
                    </Group>
                  ) : null}
                  {hasNoDemand ? (
                    <Text size="xs" c="dimmed">
                      No active demand
                    </Text>
                  ) : null}
                </Group>
              );
            })() : null}
            <div className="axis-stage-table-scroll">
              <Table
                withTableBorder
                withColumnBorders
                style={tableStyle}
                className="axis-stage-table"
              >
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th
                      style={{ width: colWidths.stage }}
                      className="axis-stage-col axis-stage-col--stage"
                    >
                      Stage
                    </Table.Th>
                    {cols.map((l: string, i: number) => (
                      <Table.Th
                        key={`qcol-${idx}-${i}`}
                        style={{ ...thCenter, width: colWidths.size }}
                      >
                        {l || `${i + 1}`}
                      </Table.Th>
                    ))}
                    <Table.Th style={{ ...thCenter, width: colWidths.total }}>
                      Total
                    </Table.Th>
                    <Table.Th style={{ ...thCenter, width: colWidths.loss }}>
                      Loss
                    </Table.Th>
                    <Table.Th style={{ ...thCenter, width: colWidths.out }}>
                      Out
                    </Table.Th>
                    <Table.Th style={{ ...thCenter, width: colWidths.eta }}>
                      ETA
                    </Table.Th>
                    <Table.Th
                      style={{ width: colWidths.status }}
                      className="axis-stage-col axis-stage-col--status"
                    >
                      Status
                    </Table.Th>
                    <Table.Th
                      style={{ ...thCenter, width: colWidths.act }}
                      className="axis-stage-col axis-stage-col--act"
                    />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {/* NOTE: External steps are rendered as stage rows. Do NOT create separate UI containers for them. */}
                  {(it.stageRows && it.stageRows.length
                    ? it.stageRows
                    : buildLegacyRows(it)
                  ).map((row, rowIdx) => {
                    const splitMeta = splitMetaByAssemblyId?.[it.assemblyId];
                    const splitStageKey = String(
                      splitMeta?.splitStageKey || ""
                    ).toLowerCase();
                    const splitParentId = splitParentByAssemblyId?.[it.assemblyId];
                    if (row.kind === "external") {
                      const externalRow = row as ExternalStageRow;
                      const receivedValues = padArray(
                        externalRow.received,
                        cols.length
                      );
                      const isSplitStage =
                        Boolean(splitMeta) &&
                        splitStageKey.startsWith("external:") &&
                        splitStageKey.split(":")[1]?.toLowerCase() ===
                          String(externalRow.externalStepType || "").toLowerCase();
                      const splitOutTotal = isSplitStage
                        ? sumArr(splitMeta?.allocatedBreakdown || []) ||
                          Number(splitMeta?.totalAllocated || 0)
                        : 0;
                      const showProjectedExternal = Boolean(
                        it.projectedStages?.externalTypes?.includes(
                          String(externalRow.externalStepType)
                        )
                      );
                      const etaText = externalRow.etaDate
                        ? fmtEta(externalRow.etaDate) || ""
                        : "No ETA";
                      const chips = buildStatusChips(
                        it.assemblyId,
                        externalRow,
                        receivedValues
                      );
                      return (
                        <Table.Tr key={`ext-${idx}-${rowIdx}`}>
                          <Table.Td
                            style={tdBase}
                            className="axis-stage-col axis-stage-col--stage"
                          >
                            <Group gap={6} wrap="nowrap">
                              <Text fw={600} size="xs">
                                {getStageLabelForRow(externalRow)}
                              </Text>
                              {showProjectedExternal ? (
                                <Tooltip
                                  label="Inherited from split"
                                  withArrow
                                >
                                  <AxisChip tone="info">
                                    Inherited (split)
                                  </AxisChip>
                                </Tooltip>
                              ) : null}
                              {showProjectedExternal && splitParentId ? (
                                renderAssemblyChip(
                                  splitParentId,
                                  `From A${splitParentId}`
                                )
                              ) : null}
                            </Group>
                          </Table.Td>
                          {cols.map((_l, i) => (
                            <Table.Td
                              key={`ext-cell-${idx}-${rowIdx}-${i}`}
                              style={tdCenter}
                            >
                              <Text fw={600} size="sm">
                                {fmtNum(receivedValues[i])}
                              </Text>
                            </Table.Td>
                          ))}
                          <Table.Td style={tdCenter}>
                            <Text fw={600} size="sm">
                              {fmtNum(externalRow.totals.received)}
                            </Text>
                          </Table.Td>
                          <Table.Td style={tdCenter}>
                            <Text fw={600} size="sm" c="dimmed">
                              —
                            </Text>
                          </Table.Td>
                          <Table.Td style={tdCenter}>
                            <Tooltip
                              label="Outstanding (sent - received)"
                              withArrow
                            >
                              <span>
                                <Text fw={600} size="sm">
                                  {fmtNum(externalRow.totals.loss)}
                                </Text>
                              </span>
                            </Tooltip>
                          </Table.Td>
                          <Table.Td style={tdCenter} title={etaText}>
                            <Text
                              size="sm"
                              style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {etaText}
                            </Text>
                          </Table.Td>
                          <Table.Td
                            style={tdBase}
                            className="axis-stage-col axis-stage-col--status"
                          >
                            <Group
                              gap={6}
                              wrap="nowrap"
                              style={{ overflow: "hidden", height: 26 }}
                            >
                              {isSplitStage ? (
                                <>
                                  <AxisChip tone="neutral">
                                    Split out: {Number(splitOutTotal) || 0}
                                  </AxisChip>
                                  {(splitMeta?.childAssemblyIds || []).map(
                                    (childId) => (
                                      <span
                                        key={`split-child-${it.assemblyId}-${childId}`}
                                      >
                                        {renderAssemblyChip(childId)}
                                      </span>
                                    )
                                  )}
                                </>
                              ) : null}
                              {chips.map((chip) => (
                                <Tooltip
                                  key={`${it.assemblyId}-${rowIdx}-${chip.key}`}
                                  label={chip.tooltip}
                                  withArrow
                                  multiline
                                >
                                  <AxisChip tone={chip.tone}>
                                    {chip.label}
                                  </AxisChip>
                                </Tooltip>
                              ))}
                            </Group>
                          </Table.Td>
                          <Table.Td
                            style={tdCenter}
                            className="axis-stage-col axis-stage-col--act"
                          >
                            <Group
                              gap={6}
                              wrap="nowrap"
                              justify="center"
                              style={{ overflow: "hidden" }}
                            >
                              {onExternalSend &&
                              externalRow.expected &&
                              externalRow.status === "NOT_STARTED" ? (
                                <Tooltip label="Send out" withArrow>
                                  <ActionIcon
                                    variant="light"
                                    aria-label="Send out"
                                    onClick={() =>
                                      onExternalSend(it.assemblyId, externalRow)
                                    }
                                  >
                                    <IconArrowUpRight size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                              {onExternalReceive &&
                              externalRow.status === "IN_PROGRESS" ? (
                                <Tooltip label="Receive in" withArrow>
                                  <ActionIcon
                                    variant="light"
                                    aria-label="Receive in"
                                    onClick={() =>
                                      onExternalReceive(
                                        it.assemblyId,
                                        externalRow
                                      )
                                    }
                                  >
                                    <IconArrowDownLeft size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    }
                    const internalRow = row;
                    const showProjectedCut =
                      internalRow.stage === "cut" &&
                      Boolean(it.projectedStages?.cut);
                    const showProjectedFinish =
                      internalRow.stage === "finish" &&
                      Boolean(it.projectedStages?.finish);
                    const isSplitStage =
                      Boolean(splitMeta) &&
                      splitStageKey === String(internalRow.stage || "").toLowerCase();
                    const splitOutTotal = isSplitStage
                      ? sumArr(splitMeta?.allocatedBreakdown || []) ||
                        Number(splitMeta?.totalAllocated || 0)
                      : 0;
                    const breakdownValues =
                      internalRow.stage === "order" &&
                      idx === 0 &&
                      editableOrdered
                        ? padArray(effectiveOrdered, cols.length)
                        : padArray(internalRow.breakdown, cols.length);
                    const chips = buildStatusChips(
                      it.assemblyId,
                      internalRow,
                      breakdownValues,
                      internalRow.breakdown
                    );
                    const extraChips: ChipSpec[] = [];
                    if (internalRow.stage === "retain") {
                      const finishTotal =
                        typeof it.totals?.finish === "number"
                          ? it.totals.finish
                          : sumArr(it.finish);
                      const remaining = Math.max(
                        0,
                        Number(finishTotal || 0) - Number(internalRow.total || 0)
                      );
                      if (remaining > 0) {
                        extraChips.push({
                          key: "retain-remaining",
                          tone: "neutral",
                          label: `Remaining ${remaining}`,
                          tooltip: "Finished units not retained yet.",
                        });
                      }
                    }
                    const rowChips = [...extraChips, ...chips];
                    return (
                      <Table.Tr key={`int-${idx}-${rowIdx}`}>
                        <Table.Td
                          style={tdBase}
                          className="axis-stage-col axis-stage-col--stage"
                        >
                          <Group gap={6} wrap="nowrap">
                            {internalRow.hint ? (
                              <Tooltip label={internalRow.hint} withArrow>
                                <span>
                                  <Text fw={600} size="xs">
                                    {getStageLabelForRow(internalRow)}
                                  </Text>
                                </span>
                              </Tooltip>
                            ) : (
                              <Text fw={600} size="xs">
                                {getStageLabelForRow(internalRow)}
                              </Text>
                            )}
                            {showProjectedCut || showProjectedFinish ? (
                              <Tooltip
                                label="Inherited from split"
                                withArrow
                              >
                                <AxisChip tone="info">
                                  Inherited (split)
                                </AxisChip>
                              </Tooltip>
                            ) : null}
                            {(showProjectedCut || showProjectedFinish) &&
                            splitParentId
                              ? renderAssemblyChip(
                                  splitParentId,
                                  `From A${splitParentId}`
                                )
                              : null}
                          </Group>
                        </Table.Td>
                        {breakdownValues.map((value, i) => (
                          <Table.Td
                            key={`int-cell-${idx}-${rowIdx}-${i}`}
                            align="center"
                            style={{
                              ...tdCenter,
                              padding:
                                internalRow.stage === "order" &&
                                editableOrdered &&
                                idx === 0
                                  ? 0
                                  : undefined,
                            }}
                          >
                            {internalRow.stage === "order" &&
                            editableOrdered &&
                            idx === 0 ? (
                              <EmbeddedTextInput
                                type="number"
                                value={value === 0 ? "" : value ?? 0}
                                padding={6}
                                inputStyle={{ fontWeight: 600, fontSize: 14 }}
                                onChange={(e) =>
                                  handleChangeCell(i, e.currentTarget.value)
                                }
                              />
                            ) : (
                              <Text fw={600} size="sm">
                                {fmtNum(value)}
                              </Text>
                            )}
                          </Table.Td>
                        ))}
                        <Table.Td style={tdCenter}>
                          <Text fw={600} size="sm">
                            {internalRow.stage === "order" &&
                            editableOrdered &&
                            idx === 0
                              ? fmtNum(totalOrdered)
                              : fmtNum(internalRow.total)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={tdCenter}>
                          <Text fw={600} size="sm">
                            {fmtNum(internalRow.lossTotal)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={tdCenter}>
                          <Text fw={600} size="sm" c="dimmed">
                            —
                          </Text>
                        </Table.Td>
                        <Table.Td style={tdCenter} />
                        <Table.Td
                          style={tdBase}
                          className="axis-stage-col axis-stage-col--status"
                        >
                          <Group
                            gap={6}
                            wrap="nowrap"
                            style={{ overflow: "hidden", height: 26 }}
                          >
                            {isSplitStage ? (
                              <>
                                <AxisChip tone="neutral">
                                  Split out: {Number(splitOutTotal) || 0}
                                </AxisChip>
                                {(splitMeta?.childAssemblyIds || []).map(
                                  (childId) => (
                                    <span
                                      key={`split-child-${it.assemblyId}-${childId}`}
                                    >
                                      {renderAssemblyChip(childId)}
                                    </span>
                                  )
                                )}
                              </>
                            ) : null}
                            {rowChips.map((chip) => (
                              <Tooltip
                                key={`${it.assemblyId}-${rowIdx}-${chip.key}`}
                                label={chip.tooltip}
                                withArrow
                                multiline
                              >
                                <AxisChip tone={chip.tone}>
                                  {chip.label}
                                </AxisChip>
                              </Tooltip>
                            ))}
                          </Group>
                        </Table.Td>
                        <Table.Td
                          style={tdCenter}
                          className="axis-stage-col axis-stage-col--act"
                        >
                          {idx === 0 && hasInternalActions ? (
                            <Group gap={6} wrap="nowrap" justify="center">
                              {internalRow.stage === "cut" &&
                              actionColumn?.onRecordCut ? (
                                <Tooltip label="Record Cut" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    aria-label="Record cut"
                                    onClick={actionColumn.onRecordCut}
                                  >
                                    <IconScissors size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                              {internalRow.stage === "sew" &&
                              actionColumn?.onRecordSew &&
                              !actionColumn.recordSewDisabled ? (
                                <Tooltip label="Record Sew" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    aria-label="Record sew"
                                    onClick={actionColumn.onRecordSew}
                                  >
                                    <IconNeedle size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                              {internalRow.stage === "finish" &&
                              actionColumn?.onRecordFinish ? (
                                <Tooltip label="Record Finish" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    aria-label="Record finish"
                                    onClick={actionColumn.onRecordFinish}
                                    disabled={actionColumn.recordFinishDisabled}
                                  >
                                    <IconSettings size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                              {internalRow.stage === "pack" &&
                              actionColumn?.onRecordPack ? (
                                <Tooltip label="Add to box" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    aria-label="Add to box"
                                    onClick={actionColumn.onRecordPack}
                                    disabled={actionColumn.recordPackDisabled}
                                  >
                                    <IconBox size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                              {internalRow.stage === "retain" &&
                              actionColumn?.onRecordRetain ? (
                                <Tooltip label="Retain" withArrow>
                                  <ActionIcon
                                    variant="subtle"
                                    aria-label="Retain"
                                    onClick={actionColumn.onRecordRetain}
                                    disabled={actionColumn.recordRetainDisabled}
                                  >
                                    <IconBox size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              ) : null}
                            </Group>
                          ) : null}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </div>
          </div>
        ))}
      </Card.Section>
    </Card>
  );
}
