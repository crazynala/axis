import { ExternalStepType, ProductType } from "@prisma/client";
import type { CompanyOption } from "~/modules/company/components/CompanySelect";
import { prisma } from "~/utils/prisma.server";

export async function loadSupplierOptions(): Promise<CompanyOption[]> {
  const companies = await prisma.company.findMany({
    where: { isSupplier: true, isInactive: { not: true } },
    select: {
      id: true,
      name: true,
      isSupplier: true,
      isCustomer: true,
      isCarrier: true,
    },
    orderBy: { name: "asc" },
  });
  return companies.map((company) => ({
    value: company.id,
    label: company.name?.trim() || `Company ${company.id}`,
    isSupplier: company.isSupplier,
    isCustomer: company.isCustomer,
    isCarrier: company.isCarrier,
  }));
}

export async function loadSupplierOptionsByExternalStepTypes(
  stepTypes: ExternalStepType[] | null | undefined
): Promise<Record<string, CompanyOption[]>> {
  const normalized = (stepTypes || []).filter((t) =>
    Object.values(ExternalStepType).includes(t)
  );
  if (!normalized.length) return {};
  const rows = await prisma.product.findMany({
    where: {
      type: ProductType.Service,
      externalStepType: { in: normalized },
      supplierId: { not: null },
      flagIsDisabled: { not: true },
      supplier: { isSupplier: true, isInactive: { not: true } },
    },
    select: {
      externalStepType: true,
      supplier: {
        select: {
          id: true,
          name: true,
          isSupplier: true,
          isCustomer: true,
          isCarrier: true,
        },
      },
    },
  });
  const map = new Map<ExternalStepType, Map<number, CompanyOption>>();
  rows.forEach((row) => {
    const type = row.externalStepType;
    const supplier = row.supplier;
    if (!type || !supplier) return;
    const byId = map.get(type) || new Map<number, CompanyOption>();
    if (!byId.has(supplier.id)) {
      byId.set(supplier.id, {
        value: supplier.id,
        label: supplier.name?.trim() || `Company ${supplier.id}`,
        isSupplier: supplier.isSupplier,
        isCustomer: supplier.isCustomer,
        isCarrier: supplier.isCarrier,
      });
      map.set(type, byId);
    }
  });
  const result: Record<string, CompanyOption[]> = {};
  normalized.forEach((type) => {
    const vendors = Array.from(map.get(type)?.values() || []).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
    result[type] = vendors;
  });
  return result;
}
