import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [{ title: "Jobs" }];

export default function JobsRoute() {
  return <h1>Jobs</h1>;
}
