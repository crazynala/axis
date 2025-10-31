import { prisma } from "./prisma.server";

export type Option = { value: string; label: string };
export type OptionsData = {
  categoryOptions: Option[];
  subcategoryOptions: Option[];
  taxCodeOptions: Option[];
  taxRateById?: Record<string | number, number>;
  productTypeOptions: Option[];
  companyAllOptions: Option[];
  customerOptions: Option[];
  customerAllOptions: Option[];
  supplierOptions: Option[];
  supplierAllOptions: Option[];
  carrierOptions: Option[];
  locationOptions: Option[];
  jobTypeOptions: Option[];
  jobStatusOptions: Option[];
  variantSetOptions: Option[];
  // New: sale price groups and cost groups as id/name option lists
  salePriceGroupOptions?: Option[];
  costGroupOptions?: Option[];
};

type CacheEntry<T> = { value: T; at: number };
const TTL_MS = 5 * 60 * 1000; // 5 minutes (value lists change rarely)

let optionsCache: CacheEntry<OptionsData> | null = null;

function isFresh(entry: CacheEntry<any> | null) {
  if (!entry) return false;
  return Date.now() - entry.at < TTL_MS;
}

export async function loadOptions(): Promise<OptionsData> {
  if (isFresh(optionsCache)) {
    try {
      const ageMs = Date.now() - (optionsCache!.at || 0);
      const v = optionsCache!.value;
      // eslint-disable-next-line no-console
      console.log("[options] cache hit", {
        ageMs,
        category: v.categoryOptions.length,
        subcategory: v.subcategoryOptions.length,
        tax: v.taxCodeOptions.length,
        productType: v.productTypeOptions.length,
        customers: v.customerOptions.length,
        suppliers: v.supplierOptions.length,
        carriers: v.carrierOptions.length,
        locations: v.locationOptions.length,
        jobTypes: v.jobTypeOptions.length,
        jobStatuses: v.jobStatusOptions.length,
        variantSets: v.variantSetOptions.length,
      });
    } catch {}
    return optionsCache!.value;
  }

  const startedAt = Date.now();

  const [
    categories,
    subcategories,
    taxes,
    companies_all,
    customers,
    customers_all,
    suppliers,
    suppliers_all,
    productTypesVL,
    jobTypesVL,
    jobStatusesVL,
    carriers,
    locations,
    variantSets,
    salePriceGroups,
    costGroups,
  ] = await Promise.all([
    prisma.valueList.findMany({
      where: { type: "Category" },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
    prisma.valueList.findMany({
      where: { type: "Subcategory" },
      orderBy: { label: "asc" },
      select: { id: true, label: true },
    }),
    prisma.valueList.findMany({
      where: { type: "Tax" },
      orderBy: { label: "asc" },
      select: { id: true, label: true, value: true },
    }),
    prisma.company.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.company.findMany({
      where: {
        isCustomer: true,
        OR: [{ isInactive: false }, { isInactive: null }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.company.findMany({
      where: { isCustomer: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.company.findMany({
      where: {
        isSupplier: true,
        OR: [{ isInactive: false }, { isInactive: null }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.company.findMany({
      where: { isSupplier: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.valueList.findMany({
      where: { type: "ProductType" },
      orderBy: { label: "asc" },
      select: { code: true, label: true },
    }),
    prisma.valueList.findMany({
      where: { type: "JobType" },
      orderBy: { label: "asc" },
      select: { code: true, label: true },
    }),
    prisma.valueList.findMany({
      where: { type: "JobStatus" },
      orderBy: { label: "asc" },
      select: { code: true, label: true },
    }),
    prisma.company.findMany({
      where: { isCarrier: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.location.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.variantSet.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 2000,
    }),
    prisma.salePriceGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
    prisma.productCostGroup.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000,
    }),
  ]);

  // Prefer ValueList(ProductType). If empty, fall back to enum defaults.
  const productTypes = productTypesVL.length
    ? productTypesVL.map((pt) => pt.code || pt.label || "")
    : ["CMT", "Fabric", "Finished", "Trim", "Service"];

  // If filtered customers/suppliers are empty, fall back to all companies to avoid empty pickers.
  const customersAllList =
    customers_all.length > 0 ? customers_all : companies_all;
  const suppliersAllList =
    suppliers_all.length > 0 ? suppliers_all : companies_all;
  const customersList = customers.length > 0 ? customers : customersAllList;
  const suppliersList = suppliers.length > 0 ? suppliers : suppliersAllList;
  const carriersList = carriers.length > 0 ? carriers : companies_all;

  // Build base value object
  const value: OptionsData = {
    categoryOptions: categories.map((c) => ({
      value: String(c.id),
      label: c.label ?? String(c.id),
    })),
    subcategoryOptions: subcategories.map((s) => ({
      value: String(s.id),
      label: s.label ?? String(s.id),
    })),
    taxCodeOptions: taxes.map((t) => ({
      value: String(t.id),
      label: t.label ?? String(t.id),
    })),
    taxRateById: Object.fromEntries(
      taxes.map((t) => {
        const n = Number((t as any)?.value ?? 0);
        return [String(t.id), Number.isFinite(n) ? n : 0];
      })
    ),
    productTypeOptions: productTypes.map((pt) => ({ value: pt, label: pt })),
    companyAllOptions: companies_all.map((c) => ({
      value: String(c.id),
      label: c.name ?? String(c.id),
    })),
    customerOptions: customersList.map((c) => ({
      value: String(c.id),
      label: c.name ?? String(c.id),
    })),
    customerAllOptions: customersAllList.map((s) => ({
      value: String(s.id),
      label: s.name ?? String(s.id),
    })),
    supplierOptions: suppliersList.map((s) => ({
      value: String(s.id),
      label: s.name ?? String(s.id),
    })),
    supplierAllOptions: suppliersAllList.map((s) => ({
      value: String(s.id),
      label: s.name ?? String(s.id),
    })),
    carrierOptions: carriersList.map((c) => ({
      value: String(c.id),
      label: c.name ?? String(c.id),
    })),
    locationOptions: (locations || []).map((l) => ({
      value: String(l.id),
      label: l.name ?? String(l.id),
    })),
    jobTypeOptions: jobTypesVL.map((jt) => ({
      value: String(jt.code || jt.label || ""),
      label: String(jt.label || jt.code || ""),
    })),
    jobStatusOptions: jobStatusesVL.map((js) => ({
      value: String(js.code || js.label || ""),
      label: String(js.label || js.code || ""),
    })),
    variantSetOptions: variantSets.map((vs) => ({
      value: String(vs.id),
      label: vs.name ?? String(vs.id),
    })),
    salePriceGroupOptions: salePriceGroups.map((g) => ({
      value: String(g.id),
      label: g.name ?? String(g.id),
    })),
    costGroupOptions: costGroups.map((g) => ({
      value: String(g.id),
      label: g.name ?? String(g.id),
    })),
  };

  // Fallbacks: if JobType/JobStatus value lists are empty, derive distinct values from Job table
  try {
    if (value.jobTypeOptions.length === 0) {
      const jobTypeRows = await prisma.job.findMany({
        where: { jobType: { not: null } },
        select: { jobType: true },
        distinct: ["jobType"],
        take: 1000,
        orderBy: { jobType: "asc" },
      } as any);
      const derived = (jobTypeRows || [])
        .map((r: any) => r.jobType)
        .filter((s: any) => typeof s === "string" && s.trim().length > 0)
        .map((s: string) => s.trim());
      const unique = Array.from(new Set(derived));
      if (unique.length > 0) {
        value.jobTypeOptions = unique.map((s) => ({ value: s, label: s }));
        // eslint-disable-next-line no-console
        console.log("[options] jobTypeOptions fallback from Job distinct", {
          count: unique.length,
        });
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("[options] jobTypeOptions fallback failed", e);
  }
  try {
    if (value.jobStatusOptions.length === 0) {
      const statusRows = await prisma.job.findMany({
        where: { status: { not: null } },
        select: { status: true },
        distinct: ["status"],
        take: 1000,
        orderBy: { status: "asc" },
      } as any);
      const derived = (statusRows || [])
        .map((r: any) => r.status)
        .filter((s: any) => typeof s === "string" && s.trim().length > 0)
        .map((s: string) => s.trim());
      const unique = Array.from(new Set(derived));
      if (unique.length > 0) {
        value.jobStatusOptions = unique.map((s) => ({ value: s, label: s }));
        // eslint-disable-next-line no-console
        console.log("[options] jobStatusOptions fallback from Job distinct", {
          count: unique.length,
        });
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log("[options] jobStatusOptions fallback failed", e);
  }

  // If still empty, provide a small static safety net
  if (value.jobTypeOptions.length === 0) {
    const defaults = ["Production", "Sample", "Quote"];
    value.jobTypeOptions = defaults.map((s) => ({ value: s, label: s }));
    // eslint-disable-next-line no-console
    console.log("[options] jobTypeOptions using static defaults", {
      count: defaults.length,
    });
  }
  if (value.jobStatusOptions.length === 0) {
    const defaults = ["Open", "In Progress", "Complete", "Cancelled"];
    value.jobStatusOptions = defaults.map((s) => ({ value: s, label: s }));
    // eslint-disable-next-line no-console
    console.log("[options] jobStatusOptions using static defaults", {
      count: defaults.length,
    });
  }

  optionsCache = { value, at: Date.now() };
  // eslint-disable-next-line no-console
  console.log("[options] cache set", {
    tookMs: Date.now() - startedAt,
    category: value.categoryOptions.length,
    subcategory: value.subcategoryOptions.length,
    tax: value.taxCodeOptions.length,
    productType: value.productTypeOptions.length,
    customers: value.customerOptions.length,
    suppliers: value.supplierOptions.length,
    carriers: value.carrierOptions.length,
    locations: value.locationOptions.length,
    jobTypes: value.jobTypeOptions.length,
    jobStatuses: value.jobStatusOptions.length,
    variantSets: value.variantSetOptions.length,
  });

  return value;
}

export function getCachedOptions(): OptionsData | null {
  return optionsCache?.value ?? null;
}

export function invalidateAllOptions() {
  optionsCache = null;
  // eslint-disable-next-line no-console
  console.log("[options] cache invalidated: all");
}

export function invalidateValueList(type?: string) {
  // For now, the simplest approach: drop the whole cache when any value list changes
  // If needed, we can refine to partial invalidation per type.
  optionsCache = null;
  // eslint-disable-next-line no-console
  console.log("[options] cache invalidated by value list change", { type });
}
