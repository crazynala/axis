import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { MasterTableProvider } from "@aa/timber";
import { prisma } from "../utils/prisma.server";
import { productSearchSchema } from "../find/product.search-schema";
import { buildWhere } from "../find/buildWhere";

export async function loader(_args: LoaderFunctionArgs) {
  const url = new URL(_args.request.url);
  const findFlag = url.searchParams.get("find");
  let where: any = undefined;
  if (findFlag) {
    const values: any = {};
    const pass = (k: string) => {
      const v = url.searchParams.get(k);
      if (v !== null && v !== "") values[k] = v;
    };
    [
      "sku",
      "name",
      "description",
      "type",
      "costPriceMin",
      "costPriceMax",
      "manualSalePriceMin",
      "manualSalePriceMax",
      "purchaseTaxId",
      "categoryId",
      "customerId",
      "supplierId",
      "stockTrackingEnabled",
      "batchTrackingEnabled",
      "componentChildSku",
      "componentChildName",
      "componentChildSupplierId",
      "componentChildType",
    ].forEach(pass);
    where = buildWhere(values, productSearchSchema);
  }
  const products = await prisma.product.findMany({
    where,
    orderBy: { id: "asc" },
    select: { id: true, name: true, sku: true },
    take: 1000,
  });
  return json({ products });
}

export default function ProductsLayout() {
  const data = useLoaderData() as { products?: any[] };
  // console.log("Found products:", data.products);
  return (
    <MasterTableProvider initialRecords={data.products}>
      <Outlet />
    </MasterTableProvider>
  );
}
