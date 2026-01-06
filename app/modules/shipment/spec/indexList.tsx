import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";

export const shipmentColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/shipments/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    layout: { width: 110 },
    render: (r: any) =>
      r.date ? new Date(r.date).toLocaleDateString() : "",
  },
  {
    key: "type",
    title: "Type",
    accessor: "type",
    sortable: true,
    layout: { width: 90 },
  },
  {
    key: "shipmentType",
    title: "Ship Type",
    accessor: "shipmentType",
    sortable: true,
    layout: { width: 120 },
  },
  {
    key: "status",
    title: "Status",
    accessor: "status",
    sortable: true,
    layout: { width: 110 },
  },
  {
    key: "trackingNo",
    title: "Tracking",
    accessor: "trackingNo",
    sortable: true,
    layout: { width: 160 },
  },
  {
    key: "companySenderName",
    title: "From",
    accessor: "companySender.name",
    layout: { grow: 1, minWidth: 160 },
    render: (r: any) => r.companySender?.name || "",
  },
  {
    key: "companyReceiverName",
    title: "To",
    accessor: "companyReceiver.name",
    layout: { grow: 1, minWidth: 160 },
    render: (r: any) => r.companyReceiver?.name || "",
  },
];
