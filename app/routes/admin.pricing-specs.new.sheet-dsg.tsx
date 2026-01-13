import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheet } from "~/modules/pricing/components/PricingSpecSheet";
import {
  loadPricingSpecNew,
  savePricingSpecNew,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecNew;
export const action = savePricingSpecNew;

export default function PricingSpecNewSheetDsgRoute() {
  const { rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheet
        mode="new"
        title="New Price Spec (DSG Reference (legacy))"
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
      />
    </GlobalFormProvider>
  );
}
