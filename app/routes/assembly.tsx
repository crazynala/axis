import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prismaBase } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const assemblies = await prismaBase.assembly.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true, status: true },
  });
  return json({ assemblies });
}

export default function AssemblyLayout() {
  const data = useLoaderData() as { assemblies?: any[] };
  // Legacy RecordBrowserContext removed; roster managed via RecordContext in index route.
  return <Outlet />;
}
