import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet } from "@remix-run/react";
import { requireUserId } from "../utils/auth.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  // Allowlist auth routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot") ||
    pathname.startsWith("/reset")
  ) {
    return null;
  }
  await requireUserId(request);
  return null;
}

export default function Protected() {
  return <Outlet />;
}
