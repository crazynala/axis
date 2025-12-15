import "dotenv/config";
import {
  ExternalStepType,
  PrismaClient,
  ProductType,
  ValueListType,
} from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  {
    code: "FINISHED",
    label: "Finished",
    children: [
      { code: "SHIRT", label: "Shirt" },
      { code: "DRESS", label: "Dress" },
      { code: "SKIRT", label: "Skirt" },
      { code: "APRON_WAIST", label: "Apron - Waist" },
      { code: "APRON_BIB", label: "Apron - Bib/Bistro" },
      { code: "VEST", label: "Vest" },
      { code: "PANTS", label: "Pants" },
      { code: "SHORTS", label: "Shorts" },
      { code: "JACKET", label: "Jacket" },
      { code: "ACCESSORY", label: "Accessory" },
    ],
  },
  {
    code: "CMT",
    label: "CMT",
    // CMT shares the FINISHED categories semantically, but keep this group
    // if you want separate reporting/filters. Otherwise, omit this group
    // and reuse FINISHED categories for type=CMT products.
    children: [
      { code: "SHIRT", label: "Shirt" },
      { code: "DRESS", label: "Dress" },
      { code: "SKIRT", label: "Skirt" },
      { code: "APRON_WAIST", label: "Apron - Waist" },
      { code: "APRON_BIB", label: "Apron - Bib/Bistro" },
      { code: "VEST", label: "Vest" },
      { code: "PANTS", label: "Pants" },
      { code: "SHORTS", label: "Shorts" },
      { code: "JACKET", label: "Jacket" },
      { code: "ACCESSORY", label: "Accessory" },
    ],
  },
  {
    code: "FABRIC",
    label: "Fabric",
    children: [
      { code: "FABRIC", label: "Fabric" }, // keep single bucket until you define real fabric categories
    ],
  },
  {
    code: "TRIM",
    label: "Trim",
    children: [
      { code: "LBL", label: "Label" },
      { code: "BTN", label: "Button" },
      { code: "ZIP", label: "Zipper" },
      { code: "TRM", label: "Other Trim / Hardware" },
    ],
  },
  {
    code: "PACKAGING",
    label: "Packaging",
    children: [{ code: "PKG", label: "Packaging" }],
  },
  {
    code: "SERVICE",
    label: "Service",
    children: [
      { code: "PATTERN_MAKING", label: "Pattern Making Service" },
      { code: "IMPORT_DUTY", label: "Material Import Duty & Fees" },
      { code: "RC_COMMISSION", label: "RC Commission" },
      { code: "NON_DHL_SHIP", label: "Non-DHL Shipping" },
      { code: "NON_DHL_EXPORT", label: "Non-DHL Export Fees" },
      { code: "TESTING", label: "Fabric/Garment Testing" },

      // Add explicit external service categories so the UI can auto-set externalStepType + vendor-required:
      { code: "OUTSIDE_EMBROIDERY", label: "Outside Embroidery" },
      { code: "OUTSIDE_WASH", label: "Outside Wash" },
      { code: "OUTSIDE_DYE", label: "Outside Dye" },
    ],
  },
];

const jobTypes = ["Sampling", "Design", "Production", "Fabric Purchase"];

const productTypes = [
  "Finished",
  "Service",
  "Fabric",
  "Trim",
  "CMT",
  "Packaging",
];

const assemblyTypes = ["Prod", "Keep", "PP", "SMS"];
const defectReasons = ["Unspecified"];

const currencies = [
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "USD", label: "U.S. Dollar" },
  { code: "TL", label: "Turkish Lira" },
];

const shippingMethods = [
  "Air - Worldwide Express",
  "Ground",
  "Air Freight",
  "Sea Freight",
];

async function seedCategories() {
  await prisma.valueList.deleteMany({
    where: { type: ValueListType.Category },
  });

  for (const group of categories) {
    const parent = await prisma.valueList.create({
      data: {
        code: group.code,
        label: group.label,
        type: ValueListType.Category,
        parentId: null,
      },
    });

    for (const child of group.children ?? []) {
      await prisma.valueList.create({
        data: {
          code: child.code,
          label: child.label,
          type: ValueListType.Category,
          parentId: parent.id,
        },
      });
    }
  }
}

async function seedSimpleList(
  type: ValueListType,
  labels: string[]
): Promise<void> {
  await prisma.valueList.deleteMany({ where: { type } });
  for (const label of labels) {
    await prisma.valueList.create({ data: { label, type } });
  }
}

async function seedCurrencies() {
  await prisma.valueList.deleteMany({
    where: { type: ValueListType.Currency },
  });
  for (const currency of currencies) {
    await prisma.valueList.create({
      data: {
        code: currency.code,
        label: currency.label,
        type: ValueListType.Currency,
      },
    });
  }
}

type CategoryKey = `${string}::${string}`;

async function buildCategoryCache() {
  const rows = await prisma.valueList.findMany({
    where: { type: ValueListType.Category },
    select: {
      id: true,
      code: true,
      parentId: true,
      parent: { select: { code: true } },
    },
  });

  const groupByCode = new Map<string, number>();
  const leafByKey = new Map<CategoryKey, number>();

  for (const row of rows) {
    if (!row.parentId && row.code) {
      groupByCode.set(row.code, row.id);
    }
    if (row.parent?.code && row.code) {
      leafByKey.set(`${row.parent.code}::${row.code}`, row.id);
    }
  }

  return { groupByCode, leafByKey };
}

const productTemplates = [
  {
    code: "FABRIC",
    label: "Fabric",
    productType: ProductType.Fabric,
    defaultCategoryGroup: "FABRIC",
    defaultCategoryCode: "FABRIC",
    requiresSupplier: true,
    requiresCustomer: false,
    defaultStockTracking: true,
    defaultBatchTracking: true,
    skuSeriesKey: "FAB",
  },
  {
    code: "TRIM",
    label: "Trim",
    productType: ProductType.Trim,
    defaultCategoryGroup: "TRIM",
    defaultCategoryCode: "TRM", // generic "Other Trim / Hardware"
    requiresSupplier: true,
    requiresCustomer: false,
    defaultStockTracking: true,
    defaultBatchTracking: false,
    skuSeriesKey: "TRM",
  },
  {
    code: "PACKAGING",
    label: "Packaging",
    productType: ProductType.Packaging,
    defaultCategoryGroup: "PACKAGING",
    defaultCategoryCode: "PKG",
    requiresSupplier: true,
    requiresCustomer: false,
    defaultStockTracking: true,
    defaultBatchTracking: false,
    skuSeriesKey: "PKG",
  },
  {
    code: "SERVICE_INTERNAL",
    label: "Service (Internal)",
    productType: ProductType.Service,
    defaultCategoryGroup: "SERVICE",
    defaultCategoryCode: "PATTERN_MAKING", // or whichever “most common” internal service
    requiresSupplier: false,
    requiresCustomer: false,
    defaultStockTracking: false,
    defaultBatchTracking: false,
    skuSeriesKey: "SV-IN",
  },
  {
    code: "SERVICE_EXTERNAL",
    label: "Service (External / Vendor)",
    productType: ProductType.Service,
    defaultCategoryGroup: "SERVICE",
    defaultCategoryCode: "OUTSIDE_WASH", // safe default; user can change to DYE/EMB/etc.
    // NOTE: leave defaultExternalStepType null here;
    // derive it from category code (OUTSIDE_WASH/DYE/EMB) in UI + importer/resolver
    requiresSupplier: true,
    requiresCustomer: false,
    defaultStockTracking: false,
    defaultBatchTracking: false,
    skuSeriesKey: "SV-OUT",
  },
  {
    code: "FINISHED",
    label: "Finished Product",
    productType: ProductType.Finished,
    defaultCategoryGroup: "FINISHED",
    defaultCategoryCode: "SHIRT", // harmless default; user must choose anyway
    requiresSupplier: false,
    requiresCustomer: true,
    defaultStockTracking: true,
    defaultBatchTracking: true,
    skuSeriesKey: "FPR",
  },
  {
    code: "CMT",
    label: "CMT",
    productType: ProductType.CMT,
    defaultCategoryGroup: "CMT",
    defaultCategoryCode: "SHIRT",
    requiresSupplier: false,
    requiresCustomer: true,
    defaultStockTracking: false,
    defaultBatchTracking: false,
    skuSeriesKey: "CMT",
  },
];

async function seedProductTemplates() {
  const cache = await buildCategoryCache();

  for (const template of productTemplates) {
    const categoryKey =
      `${template.defaultCategoryGroup}::${template.defaultCategoryCode}` as CategoryKey;
    const defaultCategoryId = cache.leafByKey.get(categoryKey) ?? null;

    await prisma.productTemplate.upsert({
      where: { code: template.code },
      create: {
        code: template.code,
        label: template.label,
        productType: template.productType,
        defaultCategoryId,
        defaultExternalStepType: template.defaultExternalStepType ?? null,
        requiresSupplier: template.requiresSupplier ?? false,
        requiresCustomer: template.requiresCustomer ?? false,
        defaultStockTracking: template.defaultStockTracking ?? false,
        defaultBatchTracking: template.defaultBatchTracking ?? false,
        skuSeriesKey: template.skuSeriesKey ?? null,
      },
      update: {
        label: template.label,
        productType: template.productType,
        defaultCategoryId,
        defaultExternalStepType: template.defaultExternalStepType ?? null,
        requiresSupplier: template.requiresSupplier ?? false,
        requiresCustomer: template.requiresCustomer ?? false,
        defaultStockTracking: template.defaultStockTracking ?? false,
        defaultBatchTracking: template.defaultBatchTracking ?? false,
        skuSeriesKey: template.skuSeriesKey ?? null,
        isActive: true,
      },
    });

    if (template.skuSeriesKey) {
      await prisma.skuSeriesCounter.upsert({
        where: { seriesKey: template.skuSeriesKey },
        create: { seriesKey: template.skuSeriesKey },
        update: {},
      });
    }
  }
}

async function main() {
  await seedCategories();
  await seedSimpleList(ValueListType.JobType, jobTypes);
  await seedSimpleList(ValueListType.ProductType, productTypes);
  await seedSimpleList(ValueListType.AssemblyType, assemblyTypes);
  await seedSimpleList(ValueListType.DefectReason, defectReasons);
  await seedCurrencies();
  await seedSimpleList(ValueListType.ShippingMethod, shippingMethods);
  await seedProductTemplates();
  console.log("Seeded value lists");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
