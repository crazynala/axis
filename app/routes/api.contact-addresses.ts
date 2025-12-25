import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getUserId } from "~/utils/auth.server";
import { getContactAddressOptions } from "~/utils/addressOwnership.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const uid = await getUserId(request);
  if (!uid) return json({ addresses: [] }, { status: 200 });

  const url = new URL(request.url);
  const contactIdRaw = url.searchParams.get("contactId");
  const contactId = contactIdRaw ? Number(contactIdRaw) : NaN;
  if (!Number.isFinite(contactId)) {
    return json({ addresses: [] }, { status: 200 });
  }

  const addresses = await getContactAddressOptions(contactId);
  return json({ addresses });
}
