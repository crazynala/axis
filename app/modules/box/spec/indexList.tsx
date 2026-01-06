import { Link } from "@remix-run/react";
import { Badge } from "@mantine/core";
import type { ColumnDef } from "~/base/index/columns";

export const boxColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    layout: { width: 80 },
    hideable: false,
    render: (row: any) => <Link to={`/boxes/${row.id}`}>{row.id}</Link>,
  },
  {
    key: "code",
    title: "Code",
    accessor: "code",
    layout: { width: 140 },
    render: (row: any) => row.code || `Box #${row.id}`,
  },
  {
    key: "description",
    title: "Description",
    accessor: "description",
    layout: { grow: 1, minWidth: 180 },
  },
  {
    key: "companyName",
    title: "Company",
    accessor: "companyName",
    layout: { width: 160 },
    render: (row: any) => row.companyName || "—",
  },
  {
    key: "locationName",
    title: "Location",
    accessor: "locationName",
    layout: { width: 160 },
    render: (row: any) => row.locationName || "—",
  },
  {
    key: "state",
    title: "State",
    accessor: "state",
    layout: { width: 110 },
    render: (row: any) => (
      <Badge
        color={
          row.state === "shipped"
            ? "green"
            : row.state === "sealed"
            ? "yellow"
            : "blue"
        }
        variant="light"
      >
        {row.state}
      </Badge>
    ),
  },
  {
    key: "warehouseNumber",
    title: "Whse #",
    accessor: "warehouseNumber",
    layout: { width: 90 },
    render: (row: any) => row.warehouseNumber ?? "—",
  },
  {
    key: "lineCount",
    title: "Lines",
    accessor: "lineCount",
    layout: { width: 80 },
  },
  {
    key: "totalQuantity",
    title: "Qty",
    accessor: "totalQuantity",
    layout: { width: 90 },
    render: (row: any) =>
      row.totalQuantity != null ? row.totalQuantity : "—",
  },
];
