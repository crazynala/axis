import "dotenv/config";
import { PrismaClient, ValueListType } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { code: "FAB", label: "Fabric" },
  { code: "LBL", label: "Label" },
  { code: "BTN", label: "Button" },
  { code: "CMT", label: "CMT" },
  { code: "TRM", label: "Other Trim / Hardware" },
  { code: "ZIP", label: "Zipper" },
  { code: "FIN", label: "Finishing" },
  {
    code: "FPR",
    label: "Finished Product",
    children: [
      "Shirt",
      "Dress",
      "Skirt",
      "Apron - Waist",
      "Apron - Bib/Bistro",
      "Vest",
      "Pants",
      "Shorts",
      "Jacket",
      "Accessory",
    ],
  },
  {
    code: "FEE",
    label: "Other Service or Fee",
    children: [
      "Pattern Making Service",
      "Material Import Duty & Fees",
      "RC Commission",
      "Non-DHL Shipping",
      "Non-DHL Export Fees",
      "Fabric/Garment Testing",
    ],
  },
  { code: "PKG", label: "Packaging" },
];

const jobTypes = ["Sampling", "Design", "Production", "Fabric Purchase"];

const productTypes = ["Raw", "Finished", "Service", "Fabric", "Trim", "CMT"];

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
  const parentMap = new Map<string, number>();

  for (const category of categories) {
    const parent = await prisma.valueList.create({
      data: {
        code: category.code,
        label: category.label,
        type: ValueListType.Category,
      },
    });
    parentMap.set(category.code, parent.id);

    for (const child of category.children ?? []) {
      await prisma.valueList.create({
        data: {
          label: child,
          type: ValueListType.Category,
          parentId: parent.id,
        },
      });
    }
  }

  return parentMap;
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

async function main() {
  await seedCategories();
  await seedSimpleList(ValueListType.JobType, jobTypes);
  await seedSimpleList(ValueListType.ProductType, productTypes);
  await seedCurrencies();
  await seedSimpleList(ValueListType.ShippingMethod, shippingMethods);
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
