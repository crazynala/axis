import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prismaBase } from "~/utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const warehouseNumberRaw = url.searchParams.get("warehouseNumber");
  const companyIdRaw = url.searchParams.get("companyId");
  const warehouseNumber = warehouseNumberRaw ? Number(warehouseNumberRaw) : NaN;
  const companyId = companyIdRaw ? Number(companyIdRaw) : NaN;
  if (!Number.isFinite(warehouseNumber) || !Number.isFinite(companyId)) {
    return json(
      { box: null, error: "Valid box number and company are required." },
      { status: 400 }
    );
  }
  const box = await prismaBase.box.findFirst({
    where: { warehouseNumber, companyId },
    orderBy: { id: "desc" },
    select: {
      id: true,
      warehouseNumber: true,
      state: true,
      shipmentId: true,
      companyId: true,
      location: { select: { id: true, name: true } },
      destinationAddressId: true,
      destinationLocationId: true,
      destinationAddress: {
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
      destinationLocation: { select: { id: true, name: true, type: true } },
      _count: { select: { lines: true } },
    },
  });
  return json({ box });
}

export const meta = () => [];
