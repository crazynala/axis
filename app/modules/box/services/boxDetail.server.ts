import { prismaBase } from "~/utils/prisma.server";

export async function loadBoxDetail(id: number) {
  return prismaBase.box.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      shipment: {
        select: {
          id: true,
          trackingNo: true,
          type: true,
        },
      },
      lines: {
        orderBy: [{ id: "asc" }],
        select: {
          id: true,
          quantity: true,
          qtyBreakdown: true,
          notes: true,
          productId: true,
          jobId: true,
          assemblyId: true,
          batchId: true,
          shipmentLineId: true,
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              variantSetId: true,
              variantSet: { select: { id: true, name: true, variants: true } },
            },
          },
          job: { select: { id: true, name: true, projectCode: true } },
          assembly: {
            select: {
              id: true,
              name: true,
              variantSetId: true,
              variantSet: { select: { id: true, name: true, variants: true } },
            },
          },
          batch: {
            select: {
              id: true,
              codeMill: true,
              codeSartor: true,
            },
          },
        },
      },
    },
  });
}
