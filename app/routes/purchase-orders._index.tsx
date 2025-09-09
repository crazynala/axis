import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Purchase Orders" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const { where, orderBy, skip, take } = buildPrismaArgs(params, {
    searchableFields: [],
    filterMappers: {},
    defaultSort: { field: "id", dir: "asc" },
  });
  const [rows, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        date: true,
        company: { select: { name: true } },
        consignee: { select: { name: true } },
        location: { select: { name: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  return json({ rows, total, page: params.page, perPage: params.perPage });
}

export default function PurchaseOrdersIndexRoute() {
  const data = useLoaderData<typeof loader>();
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[{ label: "Purchase Orders", href: "/purchase-orders" }]}
      />
      <DataTable
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        recordsPerPage={data.perPage}
        columns={[
          {
            accessor: "id",
            render: (r: any) => (
              <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>
            ),
          },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          {
            accessor: "company.name",
            title: "Vendor",
            render: (r: any) => r.company?.name ?? "",
          },
          {
            accessor: "consignee.name",
            title: "Consignee",
            render: (r: any) => r.consignee?.name ?? "",
          },
          {
            accessor: "location.name",
            title: "Location",
            render: (r: any) => r.location?.name ?? "",
          },
        ]}
      />
    </div>
  );
}
