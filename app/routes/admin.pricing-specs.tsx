import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { requireAdminUser } from "~/utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  return null;
}

export default function AdminPricingSpecsLayoutRoute() {
  return <Outlet />;
}
