import { Link } from "@remix-run/react";
import { Badge } from "@mantine/core";
import type { ColumnDef } from "~/base/index/columns";

export const boxColumns: ColumnDef[] = [
  {
    key: "id",
    title: "ID",
    accessor: "id",
    width: 80,
    hideable: false,
    render: (row: any) => <Link to={`/boxes/${row.id}`}>{row.id}</Link>,
  },
  {
    key: "code",
    title: "Code",
    accessor: "code",
    render: (row: any) => row.code || `Box #${row.id}`,
  },
  {
    key: "description",
    title: "Description",
    accessor: "description",
  },
  {
    key: "companyName",
    title: "Company",
    accessor: "companyName",
    render: (row: any) => row.companyName || "—",
  },
  {
    key: "locationName",
    title: "Location",
    accessor: "locationName",
    render: (row: any) => row.locationName || "—",
  },
  {
    key: "state",
    title: "State",
    accessor: "state",
    width: 110,
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
    width: 90,
    render: (row: any) => row.warehouseNumber ?? "—",
  },
  {
    key: "lineCount",
    title: "Lines",
    accessor: "lineCount",
    width: 80,
  },
  {
    key: "totalQuantity",
    title: "Qty",
    accessor: "totalQuantity",
    width: 90,
    render: (row: any) =>
      row.totalQuantity != null ? row.totalQuantity : "—",
  },
];
