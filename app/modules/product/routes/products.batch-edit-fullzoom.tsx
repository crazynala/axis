import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";

// Deprecated route: redirect permanently to the supported batch editor
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const ids = url.searchParams.get("ids") || "";
  return redirect(`/products/batch/sheet?ids=${encodeURIComponent(ids)}`, {
    status: 301,
  });
}

export default function DeprecatedBatchEdit() {
  return null;
}
