import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatShortDate, formatUSD } from "~/utils/format";

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
];
