import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheetRg } from "~/modules/pricing/components/PricingSpecSheetRg";
import {
  loadPricingSpecNew,
  savePricingSpecNew,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecNew;
export const action = savePricingSpecNew;

export default function PricingSpecNewSheetRgRoute() {
  const { rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheetRg
        mode="new"
        title="New Price Spec"
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
        dsgLink="/admin/pricing-specs/new/sheet-dsg"
      />
    </GlobalFormProvider>
  );
}
