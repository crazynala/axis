import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Deprecated route: redirect permanently to the sheet route
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  return redirect(`/products/batch/sheet${url.search}`, { status: 301 });
}

export default function DeprecatedBatchFullzoom() {
  return null;
}
