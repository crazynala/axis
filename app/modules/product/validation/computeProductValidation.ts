import {
  getProductRequirements,
  productRequirementSpec,
  type RequirementLevel,
} from "./productRequirements";

export type ProductValidationSection =
  | "identity"
  | "classification"
  | "associations"
  | "inventory"
  | "pricing";

export type ProductValidationInput = {
  type?: string | null;
  sku?: string | null;
  name?: string | null;
  categoryId?: number | string | null;
  templateId?: number | string | null;
  supplierId?: number | string | null;
  customerId?: number | string | null;
  variantSetId?: number | string | null;
  costPrice?: number | string | null;
  pricingModel?: string | null;
  pricingSpecId?: number | string | null;
  baselinePriceAtMoq?: number | string | null;
  leadTimeDays?: number | string | null;
  externalStepType?: string | null;
};

export type ProductValidationResult = {
  missingRequired: string[];
  missingRecommended: string[];
  bySection: Record<
    ProductValidationSection,
    {
      missingRequired: string[];
      missingRecommended: string[];
      firstMissingField?: string | null;
    }
  >;
};

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

export function computeProductValidation(
  input: ProductValidationInput
): ProductValidationResult {
  const reqs = getProductRequirements(input.type || null);
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  const bySection: ProductValidationResult["bySection"] = {
    identity: { missingRequired: [], missingRecommended: [] },
    classification: { missingRequired: [], missingRecommended: [] },
    associations: { missingRequired: [], missingRecommended: [] },
    inventory: { missingRequired: [], missingRecommended: [] },
    pricing: { missingRequired: [], missingRecommended: [] },
  };

  for (const [field, meta] of Object.entries(productRequirementSpec)) {
    const level = reqs.fields[field] as RequirementLevel | undefined;
    if (!level || level === "notApplicable") continue;
    const value = (input as any)[field];
    const filled = isFilled(value);
    if (level === "required" && !filled) {
      missingRequired.push(meta.label);
      bySection[meta.section].missingRequired.push(meta.label);
      if (!bySection[meta.section].firstMissingField) {
        bySection[meta.section].firstMissingField = field;
      }
    } else if (level === "recommended" && !filled) {
      missingRecommended.push(meta.label);
      bySection[meta.section].missingRecommended.push(meta.label);
      if (!bySection[meta.section].firstMissingField) {
        bySection[meta.section].firstMissingField = field;
      }
    }
  }

  const pricingModel = String(input.pricingModel || "").toUpperCase();
  if (pricingModel === "CURVE_SELL_AT_MOQ") {
    const specFilled = isFilled(input.pricingSpecId);
    if (!specFilled) {
      missingRequired.push("Pricing Spec");
      bySection.pricing.missingRequired.push("Pricing Spec");
      if (!bySection.pricing.firstMissingField) {
        bySection.pricing.firstMissingField = "pricingSpecId";
      }
    }
    const baselineFilled = isFilled(input.baselinePriceAtMoq);
    if (!baselineFilled) {
      missingRequired.push("Price at MOQ");
      bySection.pricing.missingRequired.push("Price at MOQ");
      if (!bySection.pricing.firstMissingField) {
        bySection.pricing.firstMissingField = "baselinePriceAtMoq";
      }
    }
  }
  if (
    pricingModel === "TIERED_COST_PLUS_MARGIN" ||
    pricingModel === "TIERED_COST_PLUS_FIXED_SELL"
  ) {
    const costGroupFilled = isFilled(input.costGroupId);
    if (!costGroupFilled) {
      missingRequired.push("Cost Group");
      bySection.pricing.missingRequired.push("Cost Group");
      if (!bySection.pricing.firstMissingField) {
        bySection.pricing.firstMissingField = "costGroupId";
      }
    }
  }
  if (pricingModel === "TIERED_COST_PLUS_FIXED_SELL") {
    const fixedSellFilled = isFilled(input.manualSalePrice);
    if (!fixedSellFilled) {
      missingRequired.push("Sell Price");
      bySection.pricing.missingRequired.push("Sell Price");
      if (!bySection.pricing.firstMissingField) {
        bySection.pricing.firstMissingField = "manualSalePrice";
      }
    }
  }

  return { missingRequired, missingRecommended, bySection };
}
