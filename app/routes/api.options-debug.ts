import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { loadOptions } from "../utils/options.server";

export async function loader(_args: LoaderFunctionArgs) {
  const o = await loadOptions();
  return json({
    category: o.categoryOptions.length,
    subcategory: o.subcategoryOptions.length,
    tax: o.taxCodeOptions.length,
    productType: o.productTypeOptions.length,
    customers: o.customerOptions.length,
    suppliers: o.supplierOptions.length,
    carriers: o.carrierOptions.length,
    jobTypes: o.jobTypeOptions.length,
    jobStatuses: o.jobStatusOptions.length,
  });
}
