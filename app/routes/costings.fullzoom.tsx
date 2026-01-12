import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

// Deprecated route: redirect permanently to the sheet route
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/costings/sheet${url.search}`, { status: 301 });
}

export async function action() {
  return redirect("/jobs");
}

export default function DeprecatedCostingsFullzoom() {
  return null;
}
