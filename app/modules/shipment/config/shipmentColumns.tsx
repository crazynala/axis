import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";

export const shipmentColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/shipments/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "date",
    title: "Date",
    accessor: "date",
    render: (r: any) =>
      r.date ? new Date(r.date).toLocaleDateString() : "",
  },
  { key: "type", title: "Type", accessor: "type", sortable: true },
  {
    key: "shipmentType",
    title: "Ship Type",
    accessor: "shipmentType",
    sortable: true,
  },
  { key: "status", title: "Status", accessor: "status", sortable: true },
  {
    key: "trackingNo",
    title: "Tracking",
    accessor: "trackingNo",
    sortable: true,
  },
  {
    key: "companySender.name",
    title: "From",
    accessor: "companySender.name",
    render: (r: any) => r.companySender?.name || "",
  },
  {
    key: "companyReceiver.name",
    title: "To",
    accessor: "companyReceiver.name",
    render: (r: any) => r.companyReceiver?.name || "",
  },
];
