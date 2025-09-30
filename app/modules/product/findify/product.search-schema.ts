// app/find/product.search-schema.ts
import type { Prisma } from "@prisma/client";
import type { SearchSchema } from "~/base/find/findify.types";

export type ProductFindValues = {
  sku?: string;
  name?: string;
  description?: string;
  type?: string;

  costPriceMin?: number | null;
  costPriceMax?: number | null;
  manualSalePriceMin?: number | null;
  manualSalePriceMax?: number | null;

  purchaseTaxId?: number | null;
  categoryId?: number | null;
  customerId?: number | null;
  supplierId?: number | null;

  stockTrackingEnabled?: boolean | "any";
  batchTrackingEnabled?: boolean | "any";

  // “one line” for BOM criteria
  componentChildSku?: string;
  componentChildName?: string;
  componentChildSupplierId?: number | null;
  componentChildType?: string;
};

export const productSearchSchema: SearchSchema<
  ProductFindValues,
  Prisma.ProductWhereInput
> = {
  fields: {
    sku: { kind: "text", path: "sku", op: "contains", mode: "insensitive" },
    name: { kind: "text", path: "name", op: "contains", mode: "insensitive" },
    description: {
      kind: "text",
      path: "description",
      op: "contains",
      mode: "insensitive",
    },
    // 'type' is an enum; use equals (not contains)
    type: { kind: "text", path: "type", op: "equals" },

    costPriceMin: { kind: "number-min", path: "costPrice" },
    costPriceMax: { kind: "number-max", path: "costPrice" },
    manualSalePriceMin: { kind: "number-min", path: "manualSalePrice" },
    manualSalePriceMax: { kind: "number-max", path: "manualSalePrice" },

    purchaseTaxId: { kind: "id", path: "purchaseTaxId" },
    categoryId: { kind: "id", path: "categoryId" },
    customerId: { kind: "id", path: "customerId" },
    supplierId: { kind: "id", path: "supplierId" },

    stockTrackingEnabled: { kind: "bool", path: "stockTrackingEnabled" },
    batchTrackingEnabled: { kind: "bool", path: "batchTrackingEnabled" },
  },
  related: [
    {
      path: "productLines",
      quantifier: "some",
      fields: {
        componentChildSku: {
          kind: "text",
          path: "child.sku",
          op: "contains",
          mode: "insensitive",
        },
        componentChildName: {
          kind: "text",
          path: "child.name",
          op: "contains",
          mode: "insensitive",
        },
        componentChildSupplierId: { kind: "id", path: "child.supplierId" },
        // child.type is also an enum; use equals
        componentChildType: {
          kind: "text",
          path: "child.type",
          op: "equals",
        },
      },
    },
  ],
};
