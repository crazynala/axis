import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheet } from "~/modules/pricing/components/PricingSpecSheet";
import {
  loadPricingSpecEdit,
  savePricingSpecEdit,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecEdit;
export const action = savePricingSpecEdit;

export default function PricingSpecEditSheetDsgRoute() {
  const { spec, rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheet
        mode="edit"
        title={`Price Spec: ${spec.name} (DSG Reference (legacy))`}
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
      />
    </GlobalFormProvider>
  );
}
