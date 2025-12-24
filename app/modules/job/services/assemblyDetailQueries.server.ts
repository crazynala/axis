import { prisma, prismaBase } from "~/utils/prisma.server";

export async function getAssembliesForJob(opts: { jobId: number; assemblyIds: number[] }) {
  return prisma.assembly.findMany({
    where: { id: { in: opts.assemblyIds }, jobId: opts.jobId },
    include: {
      job: {
        include: {
          stockLocation: { select: { id: true, name: true } },
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
          company: { select: { id: true, priceMultiplier: true } },
        },
      },
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          leadTimeDays: true,
          supplier: {
            select: { id: true, name: true, defaultLeadTimeDays: true },
          },
        },
      },
      variantSet: true,
      primaryCosting: {
        select: { id: true, product: { select: { name: true, sku: true } } },
      },
      assemblyGroup: {
        select: { id: true, name: true },
      },
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
      costings: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              leadTimeDays: true,
              stockTrackingEnabled: true,
              batchTrackingEnabled: true,
              salePriceGroup: { select: { id: true, saleRanges: true } },
              salePriceRanges: true,
              supplier: {
                select: { id: true, name: true, defaultLeadTimeDays: true },
              },
            },
          },
          salePriceGroup: { select: { id: true, saleRanges: true } },
        },
      },
    },
    orderBy: { id: "asc" },
  });
}

export async function getOpenBoxes(opts: {
  companyId: number;
  locationId: number;
}) {
  return prisma.box.findMany({
    where: {
      companyId: opts.companyId,
      locationId: opts.locationId,
      state: "open",
    },
    select: {
      id: true,
      warehouseNumber: true,
      description: true,
      notes: true,
      locationId: true,
      state: true,
      lines: { select: { quantity: true } },
    },
    orderBy: [{ warehouseNumber: "asc" }, { id: "asc" }],
  });
}

export async function getProductVariantSetsForProducts(opts: { productIds: number[] }) {
  return prisma.product.findMany({
    where: { id: { in: opts.productIds } },
    select: { id: true, variantSet: { select: { variants: true } } },
  }) as Promise<Array<{ id: number; variantSet?: { variants: string[] } | null }>>;
}

export async function getAssemblyTypes() {
  return prisma.valueList.findMany({
    where: { type: "AssemblyType" },
    select: { label: true },
    orderBy: { label: "asc" },
  });
}

export async function getDefectReasons() {
  return prisma.valueList.findMany({
    where: { type: "DefectReason" },
    select: { id: true, label: true },
    orderBy: { label: "asc" },
  });
}

export async function getAssemblyGroupInfo(opts: { id: number }) {
  return prisma.assemblyGroup.findUnique({
    where: { id: opts.id },
    select: {
      id: true,
      name: true,
      assemblies: {
        select: { id: true, name: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  });
}

export async function getJobMinimal(opts: { jobId: number }) {
  return prisma.job.findUnique({
    where: { id: opts.jobId },
    select: { id: true, name: true },
  });
}

export async function getBoxLinesForAssemblies(opts: {
  assemblyIds: number[];
}) {
  if (!opts.assemblyIds.length) return [];
  return prisma.boxLine.findMany({
    where: { assemblyId: { in: opts.assemblyIds }, packingOnly: { not: true } },
    select: { assemblyId: true, qtyBreakdown: true, quantity: true },
    orderBy: { id: "asc" },
  });
}

export async function getProductsForCostingStocks(opts: { productIds: number[] }) {
  if (!opts.productIds.length) return [];
  return prisma.product.findMany({
    where: { id: { in: opts.productIds } },
    select: { id: true },
  });
}

export async function getProductForStockSnapshot(opts: { productId: number }) {
  return prisma.product.findUnique({ where: { id: opts.productId } });
}

export async function getUsedByCostingForAssembly(opts: { assemblyId: number }) {
  return (await prismaBase.$queryRaw`
    SELECT pml."costingId" AS cid,
           COALESCE(SUM(ABS(pml.quantity)),0)::float AS used
    FROM "ProductMovementLine" pml
    JOIN "ProductMovement" pm ON pm.id = pml."movementId"
    WHERE pm."assemblyId" = ${opts.assemblyId}
    GROUP BY pml."costingId"
  `) as Array<{ cid: number | null; used: number }>;
}

export async function getActivitiesForAssemblies(opts: { assemblyIds: number[] }) {
  if (!opts.assemblyIds.length) return [];
  return prisma.assemblyActivity.findMany({
    where: { assemblyId: { in: opts.assemblyIds } },
    include: {
      job: true,
      vendorCompany: { select: { id: true, name: true } },
    },
    orderBy: [{ activityDate: "desc" }, { id: "desc" }],
  });
}

export async function getConsumptionRowsForAssembly(opts: { assemblyId: number }) {
  return (await prismaBase.$queryRaw`
    SELECT pm."assemblyActivityId" AS aid,
           COALESCE(pml."costingId", pm."costingId") AS cid,
           COALESCE(pml."batchId", 0) AS bid,
           COALESCE(SUM(ABS(pml.quantity)), ABS(pm.quantity), 0)::float AS qty
    FROM "ProductMovement" pm
    LEFT JOIN "ProductMovementLine" pml ON pm.id = pml."movementId"
    WHERE pm."assemblyId" = ${opts.assemblyId}
    GROUP BY pm.id, pm."assemblyActivityId", cid, bid
  `) as Array<{
    aid: number | null;
    cid: number | null;
    bid: number | null;
    qty: number;
  }>;
}

export async function getProductMovementsForActivities(opts: {
  activityIds: number[];
}) {
  if (!opts.activityIds.length) return [];
  return prisma.productMovement.findMany({
    where: { assemblyActivityId: { in: opts.activityIds } },
    select: { assemblyActivityId: true, shippingLineId: true },
  });
}

export async function getShipmentLinesWithShipment(opts: { shipmentLineIds: number[] }) {
  if (!opts.shipmentLineIds.length) return [];
  return prisma.shipmentLine.findMany({
    where: { id: { in: opts.shipmentLineIds } },
    select: {
      id: true,
      shipmentId: true,
      shipment: {
        select: {
          id: true,
          trackingNo: true,
          packingSlipCode: true,
          type: true,
        },
      },
    },
  });
}

export async function getActiveProductsList() {
  return prismaBase.product.findMany({
    select: { id: true, sku: true, name: true },
    orderBy: { id: "asc" },
    where: { flagIsDisabled: false },
  });
}

export async function getVariantSetForProduct(opts: { productId: number }) {
  const p = await prisma.product.findUnique({
    where: { id: opts.productId },
    select: {
      variantSet: { select: { id: true, name: true, variants: true } },
    },
  });
  return (p?.variantSet as any) || null;
}
