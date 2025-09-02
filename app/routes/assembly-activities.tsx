import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [{ title: "Assembly Activities" }];

export default function AssemblyActivitiesRoute() {
  return <h1>Assembly Activities</h1>;
}
