import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => [{ title: "Costings" }];

export default function CostingsRoute() {
  return <h1>Costings</h1>;
}
