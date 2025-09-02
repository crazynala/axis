import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [{ title: "Assembly" }];

export default function AssemblyRoute() {
  return <h1>Assembly</h1>;
}
