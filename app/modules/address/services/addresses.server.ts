import { prisma } from "~/utils/prisma.server";

export type AddressInput = {
  id?: number;
  name?: string | null;
  addressCountry?: string | null;
  addressCountyState?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressTownCity?: string | null;
  addressZipPostCode?: string | null;
};

async function nextAddressId() {
  const max = await prisma.address.aggregate({ _max: { id: true } });
  return (max._max.id || 0) + 1;
}

function stripAddressId(input: AddressInput) {
  const { id: _id, ...rest } = input;
  return rest;
}

function ensureAddressOwnership(
  ownerType: "company" | "contact",
  ownerId: number,
  addressId: number
) {
  return prisma.address.findFirst({
    where:
      ownerType === "company"
        ? { id: addressId, companyId: ownerId }
        : { id: addressId, contactId: ownerId },
    select: { id: true },
  });
}

export async function listCompanyAddresses(companyId: number) {
  return prisma.address.findMany({
    where: { companyId },
    orderBy: { id: "asc" },
  });
}

export async function listContactAddresses(contactId: number) {
  return prisma.address.findMany({
    where: { contactId },
    orderBy: { id: "asc" },
  });
}

export async function createCompanyAddress(opts: {
  companyId: number;
  data: AddressInput;
}) {
  const id = opts.data.id ?? (await nextAddressId());
  return prisma.address.create({
    data: {
      id,
      ...stripAddressId(opts.data),
      companyId: opts.companyId,
      contactId: null,
    },
  });
}

export async function createContactAddress(opts: {
  contactId: number;
  data: AddressInput;
}) {
  const id = opts.data.id ?? (await nextAddressId());
  return prisma.address.create({
    data: {
      id,
      ...stripAddressId(opts.data),
      contactId: opts.contactId,
      companyId: null,
    },
  });
}

export async function updateCompanyAddress(opts: {
  companyId: number;
  addressId: number;
  data: AddressInput;
}) {
  const owned = await ensureAddressOwnership(
    "company",
    opts.companyId,
    opts.addressId
  );
  if (!owned) throw new Error("Address does not belong to company");
  return prisma.address.update({
    where: { id: opts.addressId },
    data: stripAddressId(opts.data),
  });
}

export async function updateContactAddress(opts: {
  contactId: number;
  addressId: number;
  data: AddressInput;
}) {
  const owned = await ensureAddressOwnership(
    "contact",
    opts.contactId,
    opts.addressId
  );
  if (!owned) throw new Error("Address does not belong to contact");
  return prisma.address.update({
    where: { id: opts.addressId },
    data: stripAddressId(opts.data),
  });
}

export async function setCompanyDefaultAddress(opts: {
  companyId: number;
  addressId: number | null;
}) {
  if (opts.addressId != null) {
    const owned = await ensureAddressOwnership(
      "company",
      opts.companyId,
      opts.addressId
    );
    if (!owned)
      throw new Error("Default address must belong to company");
  }
  return prisma.company.update({
    where: { id: opts.companyId },
    data: { defaultAddressId: opts.addressId },
  });
}

export async function setContactDefaultAddress(opts: {
  contactId: number;
  addressId: number | null;
}) {
  if (opts.addressId != null) {
    const owned = await ensureAddressOwnership(
      "contact",
      opts.contactId,
      opts.addressId
    );
    if (!owned)
      throw new Error("Default address must belong to contact");
  }
  return prisma.contact.update({
    where: { id: opts.contactId },
    data: { defaultAddressId: opts.addressId },
  });
}

export async function deleteCompanyAddress(opts: {
  companyId: number;
  addressId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({
      where: { id: opts.addressId, companyId: opts.companyId },
      select: { id: true },
    });
    if (!owned) throw new Error("Address does not belong to company");

    const company = await tx.company.findUnique({
      where: { id: opts.companyId },
      select: { defaultAddressId: true },
    });
    if (company?.defaultAddressId === opts.addressId) {
      await tx.company.update({
        where: { id: opts.companyId },
        data: { defaultAddressId: null },
      });
    }

    await tx.address.delete({ where: { id: opts.addressId } });
    return { deleted: true };
  });
}

export async function deleteContactAddress(opts: {
  contactId: number;
  addressId: number;
}) {
  return prisma.$transaction(async (tx) => {
    const owned = await tx.address.findFirst({
      where: { id: opts.addressId, contactId: opts.contactId },
      select: { id: true },
    });
    if (!owned) throw new Error("Address does not belong to contact");

    const contact = await tx.contact.findUnique({
      where: { id: opts.contactId },
      select: { defaultAddressId: true },
    });
    if (contact?.defaultAddressId === opts.addressId) {
      await tx.contact.update({
        where: { id: opts.contactId },
        data: { defaultAddressId: null },
      });
    }

    await tx.address.delete({ where: { id: opts.addressId } });
    return { deleted: true };
  });
}
