import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDebugAccess } from "~/modules/debug/debugAccess.server";
import { buildAssemblyDebug } from "~/modules/debug/builders/assembly.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { canDebug } = await getDebugAccess(request);
  if (!canDebug) {
    return json({ error: "forbidden" }, { status: 403 });
  }
  const assemblyId = Number(params.assemblyId);
  if (!Number.isFinite(assemblyId) || assemblyId <= 0) {
    return json({ error: "invalid" }, { status: 400 });
  }
  const payload = await buildAssemblyDebug(assemblyId);
  if (!payload) {
    return json({ error: "missing" }, { status: 404 });
  }
  return json(payload);
}
