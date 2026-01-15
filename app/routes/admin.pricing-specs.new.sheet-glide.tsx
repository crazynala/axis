import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheetGlide } from "~/modules/pricing/components/PricingSpecSheetGlide";
import {
  loadPricingSpecNew,
  savePricingSpecNew,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecNew;
export const action = savePricingSpecNew;

export default function PricingSpecNewSheetGlideRoute() {
  const { rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheetGlide
        mode="new"
        title="New Price Spec"
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
        storageKey="axis:glide:cols:v1:pricing-specs"
      />
    </GlobalFormProvider>
  );
}
