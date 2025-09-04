import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { RecordBrowserProvider } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const products = await prisma.product.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, sku: true },
  });
  return json({ products });
}

export default function ProductsLayout() {
  const data = useLoaderData() as { products?: any[] };
  return (
    <RecordBrowserProvider initialRecords={data?.products ?? []}>
      <Outlet />
    </RecordBrowserProvider>
  );
}
