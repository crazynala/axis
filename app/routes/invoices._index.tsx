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

export const meta: MetaFunction = () => [{ title: "Invoices" }];

export async function loader(args: LoaderFunctionArgs) {
  const params = parseTableParams(args.request.url);
  const { where, orderBy, skip, take } = buildPrismaArgs(params, {
    searchableFields: ["invoiceCode"],
    filterMappers: {
      invoiceCode: (v: string) => ({
        invoiceCode: { contains: v, mode: "insensitive" },
      }),
      status: (v: string) => ({ status: { contains: v, mode: "insensitive" } }),
    },
    defaultSort: { field: "id", dir: "asc" },
  });
  const [rows, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        invoiceCode: true,
        date: true,
        status: true,
        company: { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ]);
  // Compute totals per invoice (sum of line item priceSell * quantity)
  const ids = rows.map((r) => r.id);
  const lines = await prisma.invoiceLine.findMany({
    where: { invoiceId: { in: ids } },
    select: { invoiceId: true, priceSell: true, quantity: true },
  });
  const totals = new Map<number, number>();
  for (const l of lines) {
    const amt = (l.priceSell ?? 0) * (l.quantity ?? 0);
    totals.set(l.invoiceId!, (totals.get(l.invoiceId!) ?? 0) + amt);
  }
  const withTotals = rows.map((r) => ({ ...r, amount: totals.get(r.id) ?? 0 }));
  return json({
    rows: withTotals,
    total,
    page: params.page,
    perPage: params.perPage,
  });
}

export default function InvoicesIndexRoute() {
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
      <BreadcrumbSet breadcrumbs={[{ label: "Invoices", href: "/invoices" }]} />
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
            render: (r: any) => <Link to={`/invoices/${r.id}`}>{r.id}</Link>,
          },
          { accessor: "invoiceCode", title: "Code" },
          {
            accessor: "date",
            render: (r: any) =>
              r.date ? new Date(r.date).toLocaleDateString() : "",
          },
          {
            accessor: "company.name",
            title: "Company",
            render: (r: any) => r.company?.name ?? "",
          },
          {
            accessor: "amount",
            title: "Amount",
            render: (r: any) => (r.amount ?? 0).toFixed(2),
          },
          { accessor: "status" },
        ]}
      />
    </div>
  );
}
