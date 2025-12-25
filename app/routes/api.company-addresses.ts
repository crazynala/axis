import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUserId } from "~/utils/auth.server";
import { getCompanyAddressOptions } from "~/utils/addressOwnership.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await getUserId(request);
  if (!uid) return json({ addresses: [] }, { status: 200 });

  const url = new URL(request.url);
  const companyIdRaw = url.searchParams.get("companyId");
  const companyId = companyIdRaw ? Number(companyIdRaw) : NaN;
  if (!Number.isFinite(companyId)) {
    return json({ addresses: [] }, { status: 200 });
  }

  const addresses = await getCompanyAddressOptions(companyId);
  return json({ addresses });
}
