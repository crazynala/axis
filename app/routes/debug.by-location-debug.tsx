import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { debugProductByLocation } from "~/utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const pid = Number(url.searchParams.get("productId"));
  if (!Number.isFinite(pid))
    return json({ error: "Pass ?productId=ID" }, { status: 400 });
  const data = await debugProductByLocation(pid);
  return json(data);
}

export default function Page() {
  const data = useLoaderData<typeof loader>();
  if ((data as any)?.error) return <pre>{(data as any).error}</pre>;
  return (
    <div style={{ padding: 16 }}>
      <h3>By-Location Debug</h3>
      <details open>
        <summary>Current summary</summary>
        <pre>{JSON.stringify((data as any).current, null, 2)}</pre>
      </details>
      <details>
        <summary>Compare (simple CTE)</summary>
        <pre>{JSON.stringify((data as any).compare, null, 2)}</pre>
      </details>
      <details>
        <summary>Contributions (rows)</summary>
        <pre>{JSON.stringify((data as any).contrib, null, 2)}</pre>
      </details>
    </div>
  );
}
