import type { Prisma } from "@prisma/client";
import type { SearchSchema } from "~/base/find/findify.types";

export type BoxFindValues = {
  id?: number | string | null;
  code?: string | null;
  description?: string | null;
  state?: string | null;
  notes?: string | null;
  companyId?: number | null;
  locationId?: number | null;
  shipmentId?: number | null;
  warehouseNumberMin?: number | null;
  warehouseNumberMax?: number | null;
  shipmentNumberMin?: number | null;
  shipmentNumberMax?: number | null;
  lineProductSku?: string | null;
  lineProductName?: string | null;
  lineProductId?: number | null;
  lineJobId?: number | null;
  lineAssemblyId?: number | null;
  lineBatchId?: number | null;
};

export const boxSearchSchema: SearchSchema<
  BoxFindValues,
  Prisma.BoxWhereInput
> = {
  fields: {
    id: { kind: "id", path: "id" },
    code: { kind: "text", path: "code", op: "contains", mode: "insensitive" },
    description: {
      kind: "text",
      path: "description",
      op: "contains",
      mode: "insensitive",
    },
    state: { kind: "text", path: "state", op: "equals" },
    notes: { kind: "text", path: "notes", op: "contains", mode: "insensitive" },
    companyId: { kind: "id", path: "companyId" },
    locationId: { kind: "id", path: "locationId" },
    shipmentId: { kind: "id", path: "shipmentId" },
    warehouseNumberMin: {
      kind: "number-min",
      path: "warehouseNumber",
    },
    warehouseNumberMax: {
      kind: "number-max",
      path: "warehouseNumber",
    },
    shipmentNumberMin: {
      kind: "number-min",
      path: "shipmentNumber",
    },
    shipmentNumberMax: {
      kind: "number-max",
      path: "shipmentNumber",
    },
  },
  related: [
    {
      path: "lines",
      quantifier: "some",
      fields: {
        lineProductSku: {
          kind: "text",
          path: "product.sku",
          op: "contains",
          mode: "insensitive",
        },
        lineProductName: {
          kind: "text",
          path: "product.name",
          op: "contains",
          mode: "insensitive",
        },
        lineProductId: { kind: "id", path: "productId" },
        lineJobId: { kind: "id", path: "jobId" },
        lineAssemblyId: { kind: "id", path: "assemblyId" },
        lineBatchId: { kind: "id", path: "batchId" },
      },
    },
  ],
};
