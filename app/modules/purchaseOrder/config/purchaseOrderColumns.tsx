import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { formatShortDate, formatUSD } from "~/utils/format";

export const purchaseOrderColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    sortable: true,
    render: (r: any) => formatShortDate(r.date),
  },
  {
    key: "vendorName",
    title: "Vendor",
    accessor: "vendorName",
    sortable: true,
  },
  {
    key: "consigneeName",
    title: "Consignee",
    accessor: "consigneeName",
    sortable: true,
  },
  {
    key: "locationName",
    title: "Location",
    accessor: "locationName",
    sortable: true,
  },
  {
    key: "totalCost",
    title: "Total Cost",
    accessor: "totalCost",
    sortable: false,
    render: (r: any) => formatUSD(r.totalCost || 0),
  },
];
