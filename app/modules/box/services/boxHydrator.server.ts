import { prismaBase } from "~/utils/prisma.server";

export type BoxTableRow = {
  id: number;
  code: string | null;
  description: string | null;
  state: string;
  companyName: string | null;
  locationName: string | null;
  warehouseNumber: number | null;
  shipmentNumber: number | null;
  lineCount: number;
  totalQuantity: number;
};

export async function fetchBoxesByIds(ids: number[]): Promise<BoxTableRow[]> {
  if (!ids.length) return [];
  const rows = await prismaBase.box.findMany({
    where: { id: { in: ids } },
    orderBy: { id: "asc" },
    select: {
      id: true,
      code: true,
      description: true,
      state: true,
      warehouseNumber: true,
      shipmentNumber: true,
      company: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: {
        select: {
          quantity: true,
        },
      },
    },
  });
  return rows.map((row) => {
    const lineCount = row.lines?.length ?? 0;
    const totalQuantity = (row.lines || []).reduce((sum, line) => {
      const value = line.quantity ? Number(line.quantity) : 0;
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return {
      id: row.id,
      code: row.code,
      description: row.description,
      state: row.state,
      companyName: row.company?.name ?? null,
      locationName: row.location?.name ?? null,
      warehouseNumber:
        row.warehouseNumber != null ? Number(row.warehouseNumber) : null,
      shipmentNumber:
        row.shipmentNumber != null ? Number(row.shipmentNumber) : null,
      lineCount,
      totalQuantity,
    } satisfies BoxTableRow;
  });
}
