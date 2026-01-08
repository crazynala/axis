import { Link } from "@remix-run/react";
import type { ColumnDef } from "~/base/index/columns";
import { WarningsCell } from "~/components/WarningsCell";

export const jobColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 70 },
    hideable: false,
    render: (r: any) => <Link to={`/jobs/${r.id}`}>{r.id}</Link>,
  },
  {
    key: "companyName",
    title: "Customer",
    accessor: "company.name",
    layout: { grow: 1, minWidth: 160 },
    render: (r: any) => r.company?.name || "",
  },
  {
    key: "projectCode",
    title: "Project Code",
    accessor: "projectCode",
    sortable: true,
    layout: { width: 140 },
  },
  {
    key: "name",
    title: "Name",
    accessor: "name",
    sortable: true,
    layout: { grow: 1, minWidth: 180 },
  },
  {
    key: "jobType",
    title: "Type",
    accessor: "jobType",
    sortable: true,
    layout: { width: 120 },
  },
  {
    key: "startDate",
    title: "Start",
    accessor: "startDate",
    layout: { width: 110 },
    render: (r: any) =>
      r.startDate ? new Date(r.startDate).toLocaleDateString() : "",
  },
  {
    key: "endDate",
    title: "End",
    accessor: "endDate",
    layout: { width: 110 },
    render: (r: any) =>
      r.endDate ? new Date(r.endDate).toLocaleDateString() : "",
  },
  {
    key: "status",
    title: "Status",
    accessor: "status",
    sortable: true,
    layout: { width: 120 },
  },
  {
    key: "warnings",
    title: "Warnings",
    accessor: "warnings",
    layout: { width: 200 },
    render: (r: any) => <WarningsCell warnings={r?.warnings} />,
  },
];
