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
        companyId: true,
        consigneeCompanyId: true,
        locationId: true,
        company: { select: { id: true, name: true } },
        consignee: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);
  // Compute total cost per PO (sum of line priceCost * quantity)
  const ids = rows.map((r) => r.id);
  const lines = await prisma.purchaseOrderLine.findMany({
    where: { purchaseOrderId: { in: ids } },
    select: { purchaseOrderId: true, priceCost: true, quantity: true },
  });
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = (l.priceCost ?? 0) * (l.quantity ?? 0);
    totals.set(l.purchaseOrderId!, (totals.get(l.purchaseOrderId!) ?? 0) + amt);
  }
  // Build fallback name maps when relations are missing
  const vendorIds = Array.from(
    new Set(rows.map((r: any) => r.companyId).filter(Boolean))
  );
  const consigneeIds = Array.from(
    new Set(rows.map((r: any) => r.consigneeCompanyId).filter(Boolean))
  );
  const locationIds = Array.from(
    new Set(rows.map((r: any) => r.locationId).filter(Boolean))
  );
  const [vendors, consignees, locations] = await Promise.all([
    vendorIds.length
      ? prisma.company.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    consigneeIds.length
      ? prisma.company.findMany({
          where: { id: { in: consigneeIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    locationIds.length
      ? prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const vendorById = Object.fromEntries(
    (vendors as any[]).map((c) => [c.id, c.name || String(c.id)])
  );
  const consigneeById = Object.fromEntries(
    (consignees as any[]).map((c) => [c.id, c.name || String(c.id)])
  );
  const locationById = Object.fromEntries(
    (locations as any[]).map((l) => [l.id, l.name || String(l.id)])
  );
  const withTotals = rows.map((r: any) => ({
    ...r,
    vendorName: r.company?.name ?? (r.companyId ? vendorById[r.companyId] : ""),
    consigneeName:
      r.consignee?.name ??
      (r.consigneeCompanyId ? consigneeById[r.consigneeCompanyId] : ""),
    locationName:
      r.location?.name ?? (r.locationId ? locationById[r.locationId] : ""),
    totalCost: totals.get(r.id) ?? 0,
  }));
  return json({
    rows: withTotals,
    total,
    page: params.page,
    perPage: params.perPage,
  });
}

export default function PurchaseOrdersIndexRoute() {
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
        breadcrumbs={[{ label: "Purchase Orders", href: "/purchase-orders" }]}
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
            render: (r: any) => (
              <Link to={`/purchase-orders/${r.id}`}>{r.id}</Link>
            ),
          },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          { accessor: "vendorName", title: "Vendor" },
          { accessor: "consigneeName", title: "Consignee" },
          { accessor: "locationName", title: "Location" },
          {
            accessor: "totalCost",
            title: "Total Cost",
            render: (r: any) => (r.totalCost ?? 0).toFixed(2),
          },
        ]}
      />
    </div>
  );
}
