import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFINITIONS = [
  {
    id: 6001,
    key: "composition",
    label: "Composition",
    dataType: "STRING",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["fabric"],
    sortOrder: 10,
  },
  {
    id: 6002,
    key: "width_cm",
    label: "Width (cm)",
    dataType: "NUMBER",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["fabric"],
    sortOrder: 20,
  },
  {
    id: 6003,
    key: "weight_gsm",
    label: "Weight (gsm)",
    dataType: "NUMBER",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["fabric"],
    sortOrder: 30,
  },
  {
    id: 6004,
    key: "careLabelProfile",
    label: "Care Label Profile",
    dataType: "STRING",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["finished", "cmt"],
    sortOrder: 40,
  },
  {
    id: 6005,
    key: "button_size_ligne",
    label: "Button Size (ligne)",
    dataType: "NUMBER",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["trim"],
    sortOrder: 50,
  },
  {
    id: 6006,
    key: "button_material",
    label: "Button Material",
    dataType: "STRING",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["trim"],
    sortOrder: 60,
  },
  {
    id: 6007,
    key: "packaging_format",
    label: "Packaging Format",
    dataType: "STRING",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["packaging"],
    sortOrder: 70,
  },
  {
    id: 6008,
    key: "packaging_material",
    label: "Packaging Material",
    dataType: "STRING",
    isRequired: false,
    isFilterable: true,
    enumOptions: null,
    validation: null,
    appliesToProductTypes: ["packaging"],
    sortOrder: 80,
  },
];

async function upsertDefinition(def: (typeof DEFINITIONS)[number]) {
  await prisma.$transaction(async (tx) => {
    // If the fixed id is already taken by another key, remove it so we can reuse the id.
    await tx.$executeRaw`
      DELETE FROM "ProductAttributeDefinition"
      WHERE "id" = ${def.id} AND "key" <> ${def.key}
    `;
    // Align any existing row by key to the fixed id (ON UPDATE CASCADE will keep value rows aligned).
    await tx.$executeRaw`
      UPDATE "ProductAttributeDefinition"
      SET "id" = ${def.id}
      WHERE "key" = ${def.key} AND "id" <> ${def.id}
    `;
    await tx.productAttributeDefinition.upsert({
      where: { key: def.key },
      create: {
        id: def.id,
        key: def.key,
        label: def.label,
        dataType: def.dataType as any,
        isRequired: def.isRequired,
        isFilterable: def.isFilterable,
        enumOptions: def.enumOptions,
        validation: def.validation,
        appliesToProductTypes: def.appliesToProductTypes,
        sortOrder: def.sortOrder,
      },
      update: {
        label: def.label,
        dataType: def.dataType as any,
        isRequired: def.isRequired,
        isFilterable: def.isFilterable,
        enumOptions: def.enumOptions,
        validation: def.validation,
        appliesToProductTypes: def.appliesToProductTypes,
        sortOrder: def.sortOrder,
      },
    });
  });
}

async function main() {
  for (const def of DEFINITIONS) {
    await upsertDefinition(def);
  }
  await prisma.$executeRaw`
    SELECT setval(
      pg_get_serial_sequence('"ProductAttributeDefinition"', 'id'),
      (SELECT COALESCE(MAX(id), 1) FROM "ProductAttributeDefinition")
    )
  `;
  console.log(`[seed] Upserted ${DEFINITIONS.length} product metadata defs.`);
}

main()
  .catch((err) => {
    console.error("[seed] Product metadata failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
