import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [{ title: "Admin" }];

export default function AdminRoute() {
  return <h1>Admin</h1>;
}
