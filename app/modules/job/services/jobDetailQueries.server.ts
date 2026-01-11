import { prisma } from "~/utils/prisma.server";
import { AssemblyStage } from "@prisma/client";

export async function getJobWithAssembliesCompanyGroups(opts: { id: number }) {
  return prisma.job.findUnique({
    where: { id: opts.id },
    include: {
      assemblies: {
        include: {
          shipToLocationOverride: { select: { id: true, name: true } },
          shipToAddressOverride: {
            select: {
              id: true,
              name: true,
              addressLine1: true,
              addressTownCity: true,
              addressCountyState: true,
              addressZipPostCode: true,
              addressCountry: true,
            },
          },
        },
      },
      company: true,
      assemblyGroups: true,
      shipToLocation: { select: { id: true, name: true } },
      shipToAddress: {
        select: {
          id: true,
          name: true,
          addressLine1: true,
          addressTownCity: true,
          addressCountyState: true,
          addressZipPostCode: true,
          addressCountry: true,
        },
      },
    },
  });
}

export async function getActivityCountsByAssembly(opts: { assemblyIds: number[] }) {
  if (!opts.assemblyIds.length) return [];
  return prisma.assemblyActivity.groupBy({
    by: ["assemblyId"],
    where: { assemblyId: { in: opts.assemblyIds } },
    _count: { assemblyId: true },
  });
}

export async function getCancelActivitiesByAssembly(opts: { assemblyIds: number[] }) {
  if (!opts.assemblyIds.length) return [];
  return prisma.assemblyActivity.findMany({
    where: { assemblyId: { in: opts.assemblyIds }, stage: AssemblyStage.cancel },
    select: { assemblyId: true, qtyBreakdown: true, quantity: true },
  });
}

export async function getProductsForAssemblies(opts: { productIds: number[] }) {
  if (!opts.productIds.length) return [];
  return prisma.product.findMany({
    where: { id: { in: opts.productIds } },
    select: {
      id: true,
      sku: true,
      name: true,
      productStage: true,
      variantSet: { select: { name: true, id: true, variants: true } },
    },
  });
}

export async function getAssemblyTypes() {
  const rows = await prisma.valueList.findMany({
    where: { type: "AssemblyType" },
    select: { label: true },
    orderBy: { label: "asc" },
  });
  const labels = new Set(rows.map((row) => String(row.label || "").trim()));
  if (!labels.has("Keep")) {
    rows.push({ label: "Keep" });
  }
  if (!labels.has("Internal Dev")) {
    rows.push({ label: "Internal Dev" });
  }
  return rows;
}

export async function getCustomers() {
  return prisma.company.findMany({
    where: { isCustomer: true },
    select: {
      id: true,
      name: true,
      defaultAddressId: true,
      stockLocationId: true,
      shortCode: true,
      shortName: true,
      projectCodeNextNumber: true,
    },
    orderBy: { name: "asc" },
    take: 1000,
  });
}

export async function getProductChoices() {
  return prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      customerId: true,
      productStage: true,
      _count: { select: { productLines: true } },
      variantSet: { select: { id: true, variants: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
  });
}
