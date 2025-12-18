import { prisma } from "~/utils/prisma.server";

export async function getJobWithAssembliesCompanyGroups(opts: { id: number }) {
  return prisma.job.findUnique({
    where: { id: opts.id },
    include: { assemblies: true, company: true, assemblyGroups: true },
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

export async function getProductsForAssemblies(opts: { productIds: number[] }) {
  if (!opts.productIds.length) return [];
  return prisma.product.findMany({
    where: { id: { in: opts.productIds } },
    select: {
      id: true,
      sku: true,
      name: true,
      variantSet: { select: { name: true, id: true, variants: true } },
    },
  });
}

export async function getAssemblyTypes() {
  return prisma.valueList.findMany({
    where: { type: "AssemblyType" },
    select: { label: true },
    orderBy: { label: "asc" },
  });
}

export async function getCustomers() {
  return prisma.company.findMany({
    where: { isCustomer: true },
    select: { id: true, name: true },
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
      _count: { select: { productLines: true } },
      variantSet: { select: { id: true, variants: true } },
    },
    orderBy: { id: "asc" },
    take: 1000,
  });
}

