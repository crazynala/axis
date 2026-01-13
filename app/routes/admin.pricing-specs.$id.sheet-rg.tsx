import { useLoaderData } from "@remix-run/react";
import { GlobalFormProvider } from "@aa/timber";
import { PricingSpecSheetRg } from "~/modules/pricing/components/PricingSpecSheetRg";
import {
  loadPricingSpecEdit,
  savePricingSpecEdit,
} from "~/routes/_shared/admin.pricing-specs.sheet.server";

export const loader = loadPricingSpecEdit;
export const action = savePricingSpecEdit;

export default function PricingSpecEditSheetRgRoute() {
  const { spec, rows, actionPath, exitUrl } = useLoaderData<typeof loader>();
  return (
    <GlobalFormProvider>
      <PricingSpecSheetRg
        mode="edit"
        title={`Price Spec: ${spec.name}`}
        actionPath={actionPath}
        exitUrl={exitUrl}
        initialRows={rows}
        dsgLink={`/admin/pricing-specs/${spec.id}/sheet-dsg`}
      />
    </GlobalFormProvider>
  );
}
