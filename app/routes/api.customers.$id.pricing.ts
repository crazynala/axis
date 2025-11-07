import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { prismaBase } = await import("~/utils/prisma.server");
  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0)
    return json({ error: "Invalid id" }, { status: 400 });
  const company = await prismaBase.company.findUnique({
    where: { id },
    select: { id: true, priceMultiplier: true },
  });
  if (!company) return json({ error: "Not found" }, { status: 404 });
  const priceMultiplier =
    company.priceMultiplier != null &&
    !Number.isNaN(Number(company.priceMultiplier))
      ? Number(company.priceMultiplier)
      : 1;
  // Optional vendor context to resolve margin overrides
  const url = new URL(request.url);
  const vendorIdRaw = url.searchParams.get("vendorId");
  const vendorId = vendorIdRaw ? Number(vendorIdRaw) : null;
  let vendorDefaultMargin: number | null = null;
  let marginOverride: number | null = null;
  let globalDefaultMargin: number | null = null;
  try {
    const [{ number: defNum, value: defVal } = { number: null, value: null }] =
      await prismaBase.setting.findMany({
        where: { key: "defaultMargin" },
        take: 1,
        select: { number: true, value: true },
      });
    if (defNum != null) globalDefaultMargin = Number(defNum);
    else if (defVal != null) globalDefaultMargin = Number(defVal);
  } catch {}
  if (vendorId && Number.isFinite(vendorId)) {
    try {
      const vendor = await prismaBase.company.findUnique({
        where: { id: vendorId },
        select: { defaultMarginOverride: true },
      });
      if (vendor?.defaultMarginOverride != null)
        vendorDefaultMargin = Number(vendor.defaultMarginOverride);
    } catch {}
    try {
      const mapping = await prismaBase.vendorCustomerPricing.findUnique({
        where: { vendorId_customerId: { vendorId, customerId: id } },
        select: { marginOverride: true },
      });
      if (mapping?.marginOverride != null)
        marginOverride = Number(mapping.marginOverride);
    } catch {}
  }
  return json({
    priceMultiplier,
    marginOverride,
    vendorDefaultMargin,
    globalDefaultMargin,
  });
}

export const meta = () => [];
