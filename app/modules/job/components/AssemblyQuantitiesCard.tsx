import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { EmbeddedTextInput } from "~/components/EmbeddedTextInput";
import { useEffect, useMemo, useState } from "react";
import { IconBox, IconScissors, IconSettings } from "@tabler/icons-react";
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

const EXTERNAL_STATUS_COLORS: Record<ExternalStageRow["status"], string> = {
  NOT_STARTED: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  IMPLICIT_DONE: "teal",
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
    makeRow("pack", "Pack", item.pack || [], item.totals.pack ?? sumArr(item.pack)),
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
  cut: number[];
  sew: number[];
  finish: number[];
  pack: number[];
  totals: { cut: number; sew: number; finish: number; pack: number };
  stageRows?: StageRow[];
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
  actionColumn,
  onExternalSend,
  onExternalReceive,
  onExternalHistory,
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
  actionColumn?: {
    onRecordCut?: () => void;
    onRecordFinish?: () => void;
    recordFinishDisabled?: boolean;
    onRecordPack?: () => void;
    recordPackDisabled?: boolean;
  };
  onExternalSend?: (assemblyId: number, row: ExternalStageRow) => void;
  onExternalReceive?: (assemblyId: number, row: ExternalStageRow) => void;
  onExternalHistory?: (assemblyId: number, row: ExternalStageRow) => void;
}) {
  const fmt = (n: number | undefined) =>
    n === undefined || n === null || !Number.isFinite(n) || n === 0 ? "∙" : n;
  const hasActionColumn = Boolean(
    actionColumn &&
      (actionColumn.onRecordCut ||
        actionColumn.onRecordFinish ||
        actionColumn.onRecordPack)
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
      it.stageRows && it.stageRows.length
        ? it.stageRows
        : buildLegacyRows(it);
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
    (arr || []).reduce((t, n) => (Number.isFinite(n) ? t + (n as number) : t), 0);

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
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Type</Table.Th>
                  {cols.map((l: string, i: number) => (
                    <Table.Th
                      key={`qcol-${idx}-${i}`}
                      style={{ textAlign: "center" }}
                    >
                      {l || `${i + 1}`}
                    </Table.Th>
                  ))}
                  <Table.Th>Total</Table.Th>
                  {hasActionColumn && (
                    <Table.Th style={{ width: 30, textAlign: "center" }} />
                  )}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {/* NOTE: External steps are rendered as stage rows. Do NOT create separate UI containers for them. */}
                {(it.stageRows && it.stageRows.length
                  ? it.stageRows
                  : buildLegacyRows(it)
                ).map((row, rowIdx) => {
                  if (row.kind === "external") {
                    const externalRow = row as ExternalStageRow;
                    const receivedValues = padArray(
                      externalRow.received,
                      cols.length
                    );
                    const sentValues = padArray(
                      externalRow.sent,
                      cols.length
                    );
                    const lossValues = padArray(
                      externalRow.loss,
                      cols.length
                    );
                    return (
                      <Table.Tr key={`ext-${idx}-${rowIdx}`}>
                        <Table.Td style={{ verticalAlign: "top" }}>
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Text fw={600}>{externalRow.label}</Text>
                              <Text size="sm" c="dimmed">
                                {externalRow.vendor?.name
                                  ? `Vendor: ${externalRow.vendor.name}`
                                  : "Vendor pending"}
                              </Text>
                            </div>
                            {externalRow.totals.loss > 0 ? (
                              <Badge color="red" variant="light">
                                Lost {fmt(externalRow.totals.loss)}
                              </Badge>
                            ) : null}
                          </Group>
                          <Group gap="xs" mt={4} wrap="wrap">
                            {externalRow.etaDate ? (
                              <Badge
                                variant="light"
                                color={externalRow.isLate ? "red" : "gray"}
                              >
                                ETA{" "}
                                {formatDateValue(externalRow.etaDate) || "—"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" color="gray">
                                No ETA
                              </Badge>
                            )}
                            {externalRow.lowConfidence ? (
                              <Badge color="yellow" variant="light">
                                Low confidence
                              </Badge>
                            ) : null}
                            <Badge
                              variant="filled"
                              color={EXTERNAL_STATUS_COLORS[externalRow.status]}
                            >
                              {EXTERNAL_STATUS_LABELS[externalRow.status]}
                            </Badge>
                          </Group>
                          <Group gap="xs" mt="xs">
                            {onExternalSend &&
                            externalRow.expected &&
                            externalRow.status === "NOT_STARTED" ? (
                              <Button
                                size="compact-xs"
                                variant="light"
                                onClick={() =>
                                  onExternalSend(it.assemblyId, externalRow)
                                }
                              >
                                Send out
                              </Button>
                            ) : null}
                            {onExternalReceive &&
                            externalRow.status === "IN_PROGRESS" ? (
                              <Button
                                size="compact-xs"
                                variant="light"
                                onClick={() =>
                                  onExternalReceive(
                                    it.assemblyId,
                                    externalRow
                                  )
                                }
                              >
                                Receive in
                              </Button>
                            ) : null}
                            {onExternalHistory ? (
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                onClick={() =>
                                  onExternalHistory(
                                    it.assemblyId,
                                    externalRow
                                  )
                                }
                              >
                                View history
                              </Button>
                            ) : null}
                          </Group>
                        </Table.Td>
                        {cols.map((_l, i) => (
                          <Table.Td
                            key={`ext-cell-${idx}-${rowIdx}-${i}`}
                            align="center"
                          >
                            <Text fw={600}>{fmt(receivedValues[i])}</Text>
                            {sentValues[i] > 0 || lossValues[i] > 0 ? (
                              <Text
                                size="xs"
                                c={lossValues[i] > 0 ? "red" : "dimmed"}
                              >
                                {sentValues[i] > 0
                                  ? `sent ${fmt(sentValues[i])}`
                                  : null}
                                {lossValues[i] > 0
                                  ? sentValues[i] > 0
                                    ? ` · lost ${fmt(lossValues[i])}`
                                    : `lost ${fmt(lossValues[i])}`
                                  : null}
                              </Text>
                            ) : null}
                          </Table.Td>
                        ))}
                        <Table.Td align="center">
                          <Text fw={600}>{fmt(externalRow.totals.received)}</Text>
                          {externalRow.totals.sent > 0 ? (
                            <Text size="xs" c="dimmed">
                              sent {fmt(externalRow.totals.sent)}
                            </Text>
                          ) : null}
                          {externalRow.totals.loss > 0 ? (
                            <Text size="xs" c="red">
                              lost {fmt(externalRow.totals.loss)}
                            </Text>
                          ) : null}
                        </Table.Td>
                        {hasActionColumn && (
                          <Table.Td align="center" style={{ verticalAlign: "top" }} />
                        )}
                      </Table.Tr>
                    );
                  }
                  const internalRow = row as StageRow;
                  const breakdownValues =
                    internalRow.stage === "order" && idx === 0 && editableOrdered
                      ? padArray(effectiveOrdered, cols.length)
                      : padArray(internalRow.breakdown, cols.length);
                  return (
                    <Table.Tr key={`int-${idx}-${rowIdx}`}>
                      <Table.Td>{internalRow.label}</Table.Td>
                      {breakdownValues.map((value, i) => (
                        <Table.Td
                          key={`int-cell-${idx}-${rowIdx}-${i}`}
                          align="center"
                          style={{
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
                              value={value ?? 0}
                              onChange={(e) =>
                                handleChangeCell(i, e.currentTarget.value)
                              }
                            />
                          ) : (
                            fmt(value)
                          )}
                        </Table.Td>
                      ))}
                      <Table.Td align="center" style={{ verticalAlign: "baseline" }}>
                        {internalRow.stage === "order" && editableOrdered && idx === 0
                          ? fmt(totalOrdered)
                          : fmt(
                              internalRow.stage === "order"
                                ? sum(internalRow.breakdown)
                                : internalRow.total
                            )}
                      </Table.Td>
                      {hasActionColumn && (
                        <Table.Td align="center" style={{ verticalAlign: "middle" }}>
                          {idx === 0 && internalRow.stage === "cut" && actionColumn?.onRecordCut ? (
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
                          {idx === 0 &&
                          internalRow.stage === "finish" &&
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
                          {idx === 0 &&
                          internalRow.stage === "pack" &&
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
                        </Table.Td>
                      )}
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </div>
        ))}
      </Card.Section>
    </Card>
  );
}
