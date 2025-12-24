import { prisma } from "~/utils/prisma.server";

export type AddressOption = {
  id: number;
  name: string | null;
  addressLine1: string | null;
  addressTownCity: string | null;
  addressCountyState: string | null;
  addressZipPostCode: string | null;
  addressCountry: string | null;
};

const addressSelect = {
  id: true,
  name: true,
  addressLine1: true,
  addressTownCity: true,
  addressCountyState: true,
  addressZipPostCode: true,
  addressCountry: true,
} as const;

export async function getCompanyAddressOptions(companyId: number): Promise<AddressOption[]> {
  return prisma.address.findMany({
    where: { companyId },
    select: addressSelect,
    orderBy: { id: "asc" },
  });
}

export async function getContactAddressOptions(contactId: number): Promise<AddressOption[]> {
  return prisma.address.findMany({
    where: { contactId },
    select: addressSelect,
    orderBy: { id: "asc" },
  });
}

export async function assertAddressOwnedByCompany(
  addressId: number,
  companyId: number
): Promise<boolean> {
  if (!Number.isFinite(addressId) || !Number.isFinite(companyId)) return false;
  const address = await prisma.address.findFirst({
    where: { id: addressId, companyId },
    select: { id: true },
  });
  return Boolean(address);
}

export async function assertAddressOwnedByContact(
  addressId: number,
  contactId: number
): Promise<boolean> {
  if (!Number.isFinite(addressId) || !Number.isFinite(contactId)) return false;
  const address = await prisma.address.findFirst({
    where: { id: addressId, contactId },
    select: { id: true },
  });
  return Boolean(address);
}

export async function assertAddressAllowedForShipment(
  addressId: number,
  companyIdReceiver: number | null,
  contactIdReceiver: number | null
): Promise<boolean> {
  if (!Number.isFinite(addressId)) return false;
  if (!companyIdReceiver && !contactIdReceiver) return false;
  const address = await prisma.address.findUnique({
    where: { id: addressId },
    select: { id: true, companyId: true, contactId: true },
  });
  if (!address) return false;
  if (contactIdReceiver && address.contactId === contactIdReceiver) return true;
  if (companyIdReceiver && address.companyId === companyIdReceiver) return true;
  return false;
}
