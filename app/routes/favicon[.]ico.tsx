import type { LoaderFunctionArgs } from "@remix-run/node";

export async function loader(_args: LoaderFunctionArgs) {
  return new Response(null, { status: 204 });
}

export default function FaviconNoop() {
  return null;
}
