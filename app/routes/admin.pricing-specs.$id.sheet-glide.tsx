import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheetGlide } from "~/modules/pricing/components/PricingSpecSheetGlide";
import {
  loadPricingSpecEdit,
  savePricingSpecEdit,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecEdit;
export const action = savePricingSpecEdit;

export default function PricingSpecEditSheetGlideRoute() {
  const { spec, rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheetGlide
        mode="edit"
        title={`Price Spec: ${spec.name}`}
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
        storageKey="axis:glide:cols:v1:pricing-specs"
      />
    </GlobalFormProvider>
  );
}
