import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { requireAdminUser } from "~/utils/auth.server";
import { prismaBase } from "~/utils/prisma.server";
import { PricingSpecSheet } from "~/modules/pricing/components/PricingSpecSheet";
import {
  isPricingSpecRangeMeaningful,
  sanitizePricingSpecRanges,
  validatePricingSpecRanges,
} from "~/modules/pricing/utils/pricingSpecRanges";
import {
  makePricingSpecCode,
  normalizePricingSpecName,
} from "~/modules/pricing/utils/pricingSpecUtils.server";
import { GlobalFormProvider } from "@aa/timber";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  return json({
    name: "New Price Spec",
    rows: [],
    actionPath: "/admin/pricing-specs/new/sheet",
    exitUrl: "/admin/pricing-specs",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
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

  const created = await prismaBase.pricingSpec.create({
    data: {
      code: makePricingSpecCode(name),
      name,
      target: "SELL",
      curveFamily: "OUTSIDE_ASYMPTOTIC_LOGISTICS",
      ranges: {
        create: meaningfulRows.map((row) => ({
          rangeFrom: row.rangeFrom ?? null,
          rangeTo: row.rangeTo ?? null,
          multiplier: row.multiplier ?? 0,
        })),
      },
    },
  });

  return json({
    ok: true,
    id: created.id,
    created: meaningfulRows.length,
    updated: 0,
    deleted: 0,
  });
}

export default function PricingSpecNewSheetRoute() {
  const { name, rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheet
        mode="new"
        title="New Price Spec"
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialName={name}
        initialRows={rows}
      />
    </GlobalFormProvider>
  );
}
