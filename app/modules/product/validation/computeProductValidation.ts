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

  return { missingRequired, missingRecommended, bySection };
}
