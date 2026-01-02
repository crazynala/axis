import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";

export const jobColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 70,
    hideable: false,
    render: (r: any) => <Link to={`/jobs/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "company.name",
    title: "Customer",
    accessor: "company.name",
    render: (r: any) => r.company?.name || "",
  },
  {
    key: "projectCode",
    title: "Project Code",
    accessor: "projectCode",
    sortable: true,
  },
  { key: "name", title: "Name", accessor: "name", sortable: true },
  { key: "jobType", title: "Type", accessor: "jobType", sortable: true },
  {
    key: "startDate",
    title: "Start",
    accessor: "startDate",
    render: (r: any) =>
      r.startDate ? new Date(r.startDate).toLocaleDateString() : "",
  },
  {
    key: "endDate",
    title: "End",
    accessor: "endDate",
    render: (r: any) =>
      r.endDate ? new Date(r.endDate).toLocaleDateString() : "",
  },
  { key: "status", title: "Status", accessor: "status", sortable: true },
];
