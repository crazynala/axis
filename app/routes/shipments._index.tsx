import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  Link,
  useLoaderData,
  useLocation,
  useNavigate,
} from "@remix-run/react";
import { prisma } from "../utils/prisma.server";
import { DataTable } from "mantine-datatable";
import { buildPrismaArgs, parseTableParams } from "../utils/table.server";
import { BreadcrumbSet } from "@aa/timber";

export const meta: MetaFunction = () => [{ title: "Shipments" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const prismaArgs = buildPrismaArgs<any>(params, {
    defaultSort: { field: "id", dir: "asc" },
    searchableFields: ["trackingNo", "status", "shipmentType", "type"],
  });
  const [rows, total] = await Promise.all([
    prisma.shipment.findMany({
      ...prismaArgs,
      select: {
        id: true,
        date: true,
        status: true,
        type: true,
        shipmentType: true,
        trackingNo: true,
        companySender: { select: { name: true } },
        companyReceiver: { select: { name: true } },
      },
    }),
    prisma.shipment.count({ where: prismaArgs.where }),
  ]);
  return json({ rows, total, page: params.page, perPage: params.perPage });
}

export default function ShipmentsIndexRoute() {
  const data = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const onPageChange = (page: number) => {
    const url = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    url.searchParams.set("page", String(page));
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  const onPerPageChange = (pp: number) => {
    const url = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    url.searchParams.set("perPage", String(pp));
    url.searchParams.set("page", "1");
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[{ label: "Shipments", href: "/shipments" }]}
      />
      <DataTable
        withRowBorders
        records={data.rows as any}
        totalRecords={data.total}
        page={data.page}
        onPageChange={onPageChange}
        recordsPerPage={data.perPage}
        onRecordsPerPageChange={onPerPageChange}
        recordsPerPageOptions={[10, 20, 50, 100]}
        columns={[
          {
            accessor: "id",
            render: (r: any) => <Link to={`/shipments/${r.id}`}>{r.id}</Link>,
          },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          { accessor: "type" },
          { accessor: "shipmentType", title: "Ship Type" },
          { accessor: "status" },
          { accessor: "trackingNo", title: "Tracking" },
          {
            accessor: "companySender.name",
            title: "From",
            render: (r: any) => r.companySender?.name ?? "",
          },
          {
            accessor: "companyReceiver.name",
            title: "To",
            render: (r: any) => r.companyReceiver?.name ?? "",
          },
        ]}
      />
    </div>
  );
}
