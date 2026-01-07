import { Link } from "@remix-run/react";
import { Group, Popover, Stack } from "@mantine/core";
import type { ColumnDef } from "~/base/index/columns";
import { AxisChip, type AxisChipTone } from "~/components/AxisChip";
import { formatShortDate, formatUSD } from "~/utils/format";
import type { PurchaseOrderWarning } from "./warnings";

const warningTone = (warning: PurchaseOrderWarning): AxisChipTone =>
  warning.severity === "info" ? "info" : "warning";

function WarningsCell({ row }: { row: any }) {
  const warnings = Array.isArray(row?.warnings)
    ? (row.warnings as PurchaseOrderWarning[])
    : [];
  if (!warnings.length) return null;
  const preview = warnings.slice(0, 2);
  const remaining = warnings.length - preview.length;
  const content = (
    <Group gap={4} wrap="nowrap">
      {preview.map((warning) => (
        <AxisChip
          key={`${warning.code}-${warning.label}`}
          tone={warningTone(warning)}
        >
          {warning.label}
        </AxisChip>
      ))}
      {remaining > 0 ? <AxisChip tone="neutral">+{remaining}</AxisChip> : null}
    </Group>
  );
  return (
    <Popover
      withinPortal
      position="bottom-start"
      shadow="md"
      trigger="hover"
      openDelay={150}
      closeDelay={200}
    >
      <Popover.Target>{content}</Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          {warnings.map((warning) => (
            <AxisChip
              key={`${warning.code}-${warning.label}-full`}
              tone={warningTone(warning)}
            >
              {warning.label}
            </AxisChip>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

export const purchaseOrderColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    sortable: true,
    layout: { width: 110 },
    render: (r: any) => formatShortDate(r.date),
  },
  {
    key: "vendorName",
    title: "Vendor",
    accessor: "vendorName",
    sortable: true,
    layout: { grow: 1, minWidth: 160 },
  },
  {
    key: "consigneeName",
    title: "Consignee",
    accessor: "consigneeName",
    sortable: true,
    layout: { grow: 1, minWidth: 160 },
  },
  {
    key: "locationName",
    title: "Location",
    accessor: "locationName",
    sortable: true,
    layout: { width: 160 },
  },
  {
    key: "totalCost",
    title: "Total Cost",
    accessor: "totalCost",
    sortable: false,
    layout: { width: 120 },
    render: (r: any) => formatUSD(r.totalCost || 0),
  },
  {
    key: "warnings",
    title: "Warnings",
    accessor: "warnings",
    sortable: false,
    layout: { width: 180 },
    render: (r: any) => <WarningsCell row={r} />,
  },
];
