import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Deprecated route: redirect permanently to the sheet route
export async function loader({ params, request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const id = params.id || "";
  return redirect(`/products/${id}/bom/sheet${url.search}`, { status: 301 });
}

export default function DeprecatedBomFullzoom() {
  return null;
}
