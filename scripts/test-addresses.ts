import assert from "node:assert/strict";
import { prisma } from "../app/utils/prisma.server";
import {
  createCompanyAddress,
  createContactAddress,
  deleteCompanyAddress,
  deleteContactAddress,
  setCompanyDefaultAddress,
  setContactDefaultAddress,
} from "../app/modules/address/services/addresses.server";

async function main() {
  let companyId: number | null = null;
  let contactId: number | null = null;
  let companyAddressId: number | null = null;
  let contactAddressId: number | null = null;
  let invalidBothAddressId: number | null = null;
  let invalidNoneAddressId: number | null = null;

  try {
    const company = await prisma.company.create({
      data: { name: "Address Test Company" },
    });
    companyId = company.id;

    const contactMax = await prisma.contact.aggregate({ _max: { id: true } });
    contactId = (contactMax._max.id || 0) + 1000;
    await prisma.contact.create({
      data: {
        id: contactId,
        companyId,
        email: "address-test@example.com",
        firstName: "Address",
        lastName: "Tester",
      },
    });

    const addressMax = await prisma.address.aggregate({ _max: { id: true } });
    let nextAddressId = (addressMax._max.id || 0) + 1;
    invalidBothAddressId = nextAddressId;

    let bothOwnerError: unknown = null;
    try {
      await prisma.address.create({
        data: {
          id: nextAddressId,
          companyId,
          contactId,
        },
      });
    } catch (error) {
      bothOwnerError = error;
    }
    assert.ok(bothOwnerError, "Address with both owners should be rejected");

    nextAddressId += 1;
    invalidNoneAddressId = nextAddressId;
    let noOwnerError: unknown = null;
    try {
      await prisma.address.create({
        data: {
          id: nextAddressId,
        },
      });
    } catch (error) {
      noOwnerError = error;
    }
    assert.ok(noOwnerError, "Address with no owner should be rejected");

    const companyAddress = await createCompanyAddress({
      companyId,
      data: {
        name: "HQ",
        addressLine1: "123 Test St",
        addressTownCity: "Portland",
        addressCountyState: "OR",
        addressZipPostCode: "97201",
        addressCountry: "USA",
      },
    });
    companyAddressId = companyAddress.id;
    assert.equal(companyAddress.companyId, companyId);
    assert.equal(companyAddress.contactId, null);

    await setCompanyDefaultAddress({
      companyId,
      addressId: companyAddressId,
    });
    const companyAfterDefault = await prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultAddressId: true },
    });
    assert.equal(companyAfterDefault?.defaultAddressId, companyAddressId);

    const contactAddress = await createContactAddress({
      contactId,
      data: {
        name: "Home",
        addressLine1: "456 Example Ave",
        addressTownCity: "Austin",
        addressCountyState: "TX",
        addressZipPostCode: "78701",
        addressCountry: "USA",
      },
    });
    contactAddressId = contactAddress.id;
    assert.equal(contactAddress.contactId, contactId);
    assert.equal(contactAddress.companyId, null);

    await setContactDefaultAddress({
      contactId,
      addressId: contactAddressId,
    });
    const contactAfterDefault = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { defaultAddressId: true },
    });
    assert.equal(contactAfterDefault?.defaultAddressId, contactAddressId);

    let invalidCompanyDefaultError: unknown = null;
    try {
      await setCompanyDefaultAddress({
        companyId,
        addressId: contactAddressId,
      });
    } catch (error) {
      invalidCompanyDefaultError = error;
    }
    assert.ok(
      invalidCompanyDefaultError,
      "Company default address must belong to company"
    );

    let invalidContactDefaultError: unknown = null;
    try {
      await setContactDefaultAddress({
        contactId,
        addressId: companyAddressId,
      });
    } catch (error) {
      invalidContactDefaultError = error;
    }
    assert.ok(
      invalidContactDefaultError,
      "Contact default address must belong to contact"
    );

    await deleteCompanyAddress({ companyId, addressId: companyAddressId });
    companyAddressId = null;
    const companyAfterDelete = await prisma.company.findUnique({
      where: { id: companyId },
      select: { defaultAddressId: true },
    });
    assert.equal(companyAfterDelete?.defaultAddressId, null);

    await deleteContactAddress({ contactId, addressId: contactAddressId });
    contactAddressId = null;
    const contactAfterDelete = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { defaultAddressId: true },
    });
    assert.equal(contactAfterDelete?.defaultAddressId, null);

    console.log("address tests: ok");
  } finally {
    if (companyAddressId != null) {
      await prisma.address.delete({ where: { id: companyAddressId } });
    }
    if (contactAddressId != null) {
      await prisma.address.delete({ where: { id: contactAddressId } });
    }
    if (invalidBothAddressId != null) {
      await prisma.address.deleteMany({ where: { id: invalidBothAddressId } });
    }
    if (invalidNoneAddressId != null) {
      await prisma.address.deleteMany({ where: { id: invalidNoneAddressId } });
    }
    if (contactId != null) {
      await prisma.contact.delete({ where: { id: contactId } });
    }
    if (companyId != null) {
      await prisma.company.delete({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("address tests: failed", error);
  process.exitCode = 1;
});
