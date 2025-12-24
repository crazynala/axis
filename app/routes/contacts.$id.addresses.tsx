import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "~/utils/prisma.server";
import type { AddressInput } from "~/modules/address/services/addresses.server";
import {
  createContactAddress,
  deleteContactAddress,
  setContactDefaultAddress,
  updateContactAddress,
} from "~/modules/address/services/addresses.server";
import { getContactAddressOptions } from "~/utils/addressOwnership.server";

function readAddressInput(form: FormData): AddressInput {
  const get = (key: string) => {
    const raw = form.get(key);
    if (raw == null) return null;
    const value = String(raw).trim();
    return value === "" ? null : value;
  };
  return {
    name: get("name"),
    addressCountry: get("addressCountry"),
    addressCountyState: get("addressCountyState"),
    addressLine1: get("addressLine1"),
    addressLine2: get("addressLine2"),
    addressLine3: get("addressLine3"),
    addressTownCity: get("addressTownCity"),
    addressZipPostCode: get("addressZipPostCode"),
  };
}

function parseId(raw: FormDataEntryValue | null) {
  const value = raw == null ? NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

export async function loader({ params }: LoaderFunctionArgs) {
  const contactId = Number(params.id);
  if (!Number.isFinite(contactId)) {
    throw new Response("Invalid contact id", { status: 400 });
  }
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, defaultAddressId: true },
  });
  if (!contact) throw new Response("Contact not found", { status: 404 });

  const addresses = await getContactAddressOptions(contactId);
  return json({ contactId, defaultAddressId: contact.defaultAddressId, addresses });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const contactId = Number(params.id);
  if (!Number.isFinite(contactId)) {
    return json({ error: "Invalid contact id" }, { status: 400 });
  }
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  try {
    if (intent === "create") {
      const address = await createContactAddress({
        contactId,
        data: readAddressInput(form),
      });
      return json({ address });
    }

    if (intent === "update") {
      const addressId = parseId(form.get("addressId"));
      if (!addressId) return json({ error: "Missing addressId" }, { status: 400 });
      const address = await updateContactAddress({
        contactId,
        addressId,
        data: readAddressInput(form),
      });
      return json({ address });
    }

    if (intent === "delete") {
      const addressId = parseId(form.get("addressId"));
      if (!addressId) return json({ error: "Missing addressId" }, { status: 400 });
      await deleteContactAddress({ contactId, addressId });
      return json({ deleted: true });
    }

    if (intent === "default") {
      const addressId = parseId(form.get("addressId"));
      await setContactDefaultAddress({
        contactId,
        addressId: addressId ?? null,
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown intent" }, { status: 400 });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Request failed" },
      { status: 400 }
    );
  }
}
