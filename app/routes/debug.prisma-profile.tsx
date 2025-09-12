import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { getPrismaProfile, resetPrismaProfile } from "../utils/prisma.server";

/**
 * GET /debug/prisma-profile        -> returns aggregated query timing info (requires PRISMA_PROF=1)
 * POST /debug/prisma-profile?reset -> resets the in-memory samples
 */
export async function loader() {
  return json(getPrismaProfile(), { headers: { "Cache-Control": "no-store" } });
}

export async function action({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.has("reset")) resetPrismaProfile();
  return json({ ok: true, afterReset: url.searchParams.has("reset") });
}

export default function PrismaProfilePage() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Prisma Profile</h1>
      <p>
        Use the network/raw JSON: <code>/debug/prisma-profile</code>. Add a POST
        with
        <code>?reset</code> to clear samples. Enable with{" "}
        <code>PRISMA_PROF=1</code> env.
      </p>
    </div>
  );
}
