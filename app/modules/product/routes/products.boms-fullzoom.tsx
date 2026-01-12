import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
export { action } from "./products.boms.sheet";

// Deprecated route: redirect permanently to the sheet route
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/products/boms/sheet${url.search}`, { status: 301 });
}

export default function DeprecatedBomsFullzoom() {
  return null;
}
