import { Link } from "@remix-run/react";
import { Group, Text, Tooltip } from "@mantine/core";
import type { ColumnDef } from "~/base/index/columns";
import type { ProductionLedgerRow } from "~/modules/production/services/productionLedger.server";
import { AxisChip } from "~/components/AxisChip";

const MAX_CHIPS = 2;

const renderSignalChips = (
  signals?: ProductionLedgerRow["attentionSignals"]
) => {
  if (!signals?.length) return null;
  const visible = signals.slice(0, MAX_CHIPS);
  const extra = signals.length - visible.length;
  return (
    <Group gap={6} wrap="nowrap">
      {visible.map((signal) => {
        const chip = (
          <AxisChip key={signal.key} tone={signal.tone}>
            {signal.label}
          </AxisChip>
        );
        return signal.tooltip ? (
          <Tooltip key={signal.key} label={signal.tooltip} withArrow>
            {chip}
          </Tooltip>
        ) : (
          chip
        );
      })}
      {extra > 0 ? (
        <AxisChip tone="neutral">+{extra}</AxisChip>
      ) : null}
    </Group>
  );
};

const renderNextActions = (actions?: ProductionLedgerRow["nextActions"]) => {
  if (!actions?.length) return null;
  const visible = actions.slice(0, MAX_CHIPS);
  const extra = actions.length - visible.length;
  return (
    <Group gap={6} wrap="nowrap">
      {visible.map((action, idx) => (
        <AxisChip key={`${action.kind}-${idx}`} tone="warning">
          {action.label}
        </AxisChip>
      ))}
      {extra > 0 ? <AxisChip tone="neutral">+{extra}</AxisChip> : null}
    </Group>
  );
};

const renderExternalStep = (row: ProductionLedgerRow) => {
  const label = row.externalStepLabel || null;
  if (!label) return null;
  const vendor = row.externalVendorName || "";
  const eta = row.externalEta || "";
  return (
    <Group gap={6} wrap="nowrap">
      <AxisChip tone="info">{label}</AxisChip>
      {vendor ? (
        <Text size="xs" c="dimmed">
          {vendor}
        </Text>
      ) : null}
      {eta ? (
        <Text size="xs" c="dimmed">
          {new Date(eta).toLocaleDateString()}
        </Text>
      ) : null}
    </Group>
  );
};

const renderMaterialsShort = (row: ProductionLedgerRow) => {
  const count = row.materialsShortCount ?? 0;
  const uncovered = row.materialsUncoveredTotal ?? 0;
  if (!count) return null;
  return (
    <Group gap={6} wrap="nowrap">
      <AxisChip tone="warning">Short {count}</AxisChip>
      <Text size="xs" c="dimmed">
        {Number.isFinite(uncovered) ? uncovered : 0}
      </Text>
    </Group>
  );
};

export const productionLedgerColumns: ColumnDef<ProductionLedgerRow>[] = [
  {
    key: "id",
    title: "Assembly",
    accessor: "id",
    sortable: true,
    layout: { width: 110 },
    render: (r: any) =>
      r?.id ? (
        <Link to={`/production-ledger/assembly/${r.id}`}>A{r.id}</Link>
      ) : (
        "—"
      ),
  },
  {
    key: "customerName",
    title: "Customer",
    accessor: "customerName",
    layout: { width: 180 },
  },
  {
    key: "job",
    title: "Job",
    accessor: "jobName",
    layout: { width: 220 },
    render: (r: any) =>
      r?.jobId ? (
        <div>
          <Link to={`/jobs/${r.jobId}`}>
            {r.projectCode ? `${r.projectCode} ${r.jobId}` : `Job ${r.jobId}`}
          </Link>
          <div style={{ fontSize: 12, color: "#666" }}>
            {r.jobName || ""}
          </div>
        </div>
      ) : (
        "—"
      ),
  },
  {
    key: "name",
    title: "Assembly Name",
    accessor: "name",
    sortable: true,
    layout: { width: 200 },
  },
  {
    key: "assemblyType",
    title: "Type",
    accessor: "assemblyType",
    sortable: true,
    layout: { width: 90 },
  },
  {
    key: "primaryCostingName",
    title: "Primary Costing",
    accessor: "primaryCostingName",
    layout: { width: 180 },
  },
  {
    key: "ordered",
    title: "Ordered",
    accessor: "ordered",
    layout: { width: 90, align: "right" },
    render: (r: any) => r?.ordered ?? 0,
  },
  {
    key: "cut",
    title: "Cut",
    accessor: "cut",
    layout: { width: 90, align: "right" },
    render: (r: any) => r?.cut ?? 0,
  },
  {
    key: "sew",
    title: "Sew",
    accessor: "sew",
    layout: { width: 90, align: "right" },
    render: (r: any) => r?.sew ?? 0,
  },
  {
    key: "finish",
    title: "Finish",
    accessor: "finish",
    layout: { width: 90, align: "right" },
    render: (r: any) => r?.finish ?? 0,
  },
  {
    key: "pack",
    title: "Packed",
    accessor: "pack",
    layout: { width: 90, align: "right" },
    render: (r: any) => r?.pack ?? 0,
  },
  {
    key: "signals",
    title: "Signals",
    accessor: "attentionSignals",
    layout: { width: 220 },
    defaultVisible: false,
    render: (r: ProductionLedgerRow) => renderSignalChips(r.attentionSignals),
  },
  {
    key: "nextActions",
    title: "Next Actions",
    accessor: "nextActions",
    layout: { width: 240 },
    defaultVisible: false,
    render: (r: ProductionLedgerRow) => renderNextActions(r.nextActions),
  },
  {
    key: "externalStep",
    title: "External",
    accessor: "externalStepLabel",
    layout: { width: 220 },
    defaultVisible: false,
    render: (r: ProductionLedgerRow) => renderExternalStep(r),
  },
  {
    key: "materialsShort",
    title: "Materials",
    accessor: "materialsShortCount",
    layout: { width: 200 },
    defaultVisible: false,
    render: (r: ProductionLedgerRow) => renderMaterialsShort(r),
  },
];
