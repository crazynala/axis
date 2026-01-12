import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminUser } from "~/utils/auth.server";
import { prismaBase } from "~/utils/prisma.server";
import { PricingSpecSheet } from "~/modules/pricing/components/PricingSpecSheet";
import {
  isPricingSpecRangeMeaningful,
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
} from "~/modules/pricing/utils/pricingSpecRanges";
import { normalizePricingSpecName } from "~/modules/pricing/utils/pricingSpecUtils.server";
import { GlobalFormProvider } from "@aa/timber";

export async function loader({ params, request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const specId = Number(params.id);
  if (!Number.isFinite(specId)) {
    throw new Response("Invalid pricing spec id", { status: 400 });
  }
  const spec = await prismaBase.pricingSpec.findUnique({
    where: { id: specId },
    include: { ranges: { orderBy: { rangeFrom: "asc" } } },
  });
  if (!spec) return redirect("/admin/pricing-specs");
  const rows = (spec.ranges || []).map((range) => ({
    id: range.id,
    rangeFrom: range.rangeFrom ?? null,
    rangeTo: range.rangeTo ?? null,
    multiplier: Number(range.multiplier ?? 0) || 0,
    localKey: `range-${range.id}`,
    disableControls: false,
  }));
  return json({
    spec: { id: spec.id, name: spec.name },
    rows,
    actionPath: `/admin/pricing-specs/${spec.id}/sheet`,
    exitUrl: "/admin/pricing-specs",
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const specId = Number(params.id);
  if (!Number.isFinite(specId)) {
    return json({ error: "Invalid pricing spec id." }, { status: 400 });
  }
  const bodyText = await request.text();
  let payload: any = null;
  try {
    payload = JSON.parse(bodyText || "{}");
  } catch {}
  if (!payload || payload._intent !== "pricingSpec.save") {
    return json({ error: "Invalid intent." }, { status: 400 });
  }
  const name = normalizePricingSpecName(payload.name);
  if (!name) {
    return json({ error: "Name is required." }, { status: 400 });
  }
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const sanitized = sanitizePricingSpecRanges(rawRows);
  const validation = validatePricingSpecRanges(sanitized);
  if (validation.hasErrors) {
    return json(
      { error: "Validation failed.", errorsByIndex: validation.errorsByIndex },
      { status: 400 }
    );
  }
  const meaningfulRows = sanitized.filter(isPricingSpecRangeMeaningful);

  const existingRanges = await prismaBase.pricingSpecRange.findMany({
    where: { pricingSpecId: specId },
    select: { id: true, rangeFrom: true, rangeTo: true, multiplier: true },
  });
  const existingById = new Map(existingRanges.map((r) => [r.id, r]));
  const incomingById = new Map<number, typeof meaningfulRows[number]>();

  for (const row of meaningfulRows) {
    if (row.id != null) incomingById.set(row.id, row);
  }

  const toDelete = existingRanges
    .filter((range) => !incomingById.has(range.id))
    .map((range) => range.id);

  const toCreate = meaningfulRows.filter((row) => row.id == null);

  const toUpdate = meaningfulRows
    .filter((row) => row.id != null && existingById.has(row.id))
    .map((row) => {
      const prev = existingById.get(row.id as number)!;
      const rangeFrom = row.rangeFrom ?? null;
      const rangeTo = row.rangeTo ?? null;
      const multiplier = row.multiplier ?? 0;
      const changed =
        prev.rangeFrom !== rangeFrom ||
        prev.rangeTo !== rangeTo ||
        Number(prev.multiplier || 0) !== Number(multiplier);
      return changed
        ? {
            id: row.id as number,
            data: { rangeFrom, rangeTo, multiplier },
          }
        : null;
    })
    .filter(Boolean) as Array<{
    id: number;
    data: { rangeFrom: number | null; rangeTo: number | null; multiplier: number };
  }>;

  await prismaBase.$transaction(async (tx) => {
    await tx.pricingSpec.update({
      where: { id: specId },
      data: { name },
    });
    if (toDelete.length) {
      await tx.pricingSpecRange.deleteMany({ where: { id: { in: toDelete } } });
    }
    if (toUpdate.length) {
      await Promise.all(
        toUpdate.map((row) =>
          tx.pricingSpecRange.update({ where: { id: row.id }, data: row.data })
        )
      );
    }
    if (toCreate.length) {
      await tx.pricingSpecRange.createMany({
        data: toCreate.map((row) => ({
          pricingSpecId: specId,
          rangeFrom: row.rangeFrom ?? null,
          rangeTo: row.rangeTo ?? null,
          multiplier: row.multiplier ?? 0,
        })),
      });
    }
  });

  return json({
    ok: true,
    id: specId,
    created: toCreate.length,
    updated: toUpdate.length,
    deleted: toDelete.length,
  });
}

export default function PricingSpecEditSheetRoute() {
  const { spec, rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheet
        mode="edit"
        title={`Price Spec: ${spec.name}`}
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialName={spec.name}
        initialRows={rows}
      />
    </GlobalFormProvider>
  );
}
