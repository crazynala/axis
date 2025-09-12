import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Outlet, useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { prisma } from "../utils/prisma.server";

export async function loader(_args: LoaderFunctionArgs) {
  const companies = await prisma.company.findMany({
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
  return json({ companies });
}

export default function ContactsLayout() {
  const data = useLoaderData() as { companies?: any[] };
  // Legacy RecordBrowserContext removed; roster handled in higher-level RecordContext index routes.
  return <Outlet />;
}
