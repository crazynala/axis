export type RequirementLevel =
  | "required"
  | "recommended"
  | "optional"
  | "notApplicable";

export type RequirementSpec = Record<
  string,
  {
    label: string;
    section:
      | "identity"
      | "classification"
      | "associations"
      | "inventory"
      | "pricing";
  }
>;

export type ProductRequirements = {
  fields: Record<string, RequirementLevel>;
};

export function isFieldApplicable(
  typeRaw: string | null | undefined,
  fieldName: string | undefined
): boolean {
  if (!fieldName) return true;
  const reqs = getProductRequirements(typeRaw);
  const level = reqs.fields[fieldName];
  return level !== "notApplicable";
}

const baseSpec: RequirementSpec = {
  type: { label: "Type", section: "identity" },
  name: { label: "Name", section: "identity" },
  categoryId: { label: "Category", section: "classification" },
  templateId: { label: "Template", section: "classification" },
  supplierId: { label: "Supplier", section: "associations" },
  customerId: { label: "Customer", section: "associations" },
  variantSetId: { label: "Variant set", section: "associations" },
  costPrice: { label: "Cost price", section: "pricing" },
  leadTimeDays: { label: "Lead time", section: "inventory" },
  externalStepType: { label: "External step", section: "classification" },
};

export const APPLICABLE_FIELDS = Object.keys(baseSpec);

export function getProductRequirements(
  typeRaw: string | null | undefined
): ProductRequirements {
  const type = String(typeRaw || "").toUpperCase();
  // Default: lean requirements
  const defaults: ProductRequirements = {
    fields: {
      type: "required",
      name: "recommended",
      categoryId: "required",
      templateId: "notApplicable",
      supplierId: "optional",
      customerId: "optional",
      variantSetId: "optional",
      costPrice: "recommended",
      leadTimeDays: "recommended",
      externalStepType: "optional",
    },
  };

  switch (type) {
    case "FABRIC":
      return {
        fields: {
          ...defaults.fields,
          name: "recommended",
      categoryId: "required",
          supplierId: "required",
          customerId: "notApplicable",
          templateId: "notApplicable",
          variantSetId: "notApplicable",
          costPrice: "recommended",
          externalStepType: "notApplicable",
        },
      };
    case "TRIM":
      return {
        fields: {
          ...defaults.fields,
          supplierId: "required",
          customerId: "optional",
          variantSetId: "optional",
          externalStepType: "notApplicable",
        },
      };
    case "PACKAGING":
      return {
        fields: {
          ...defaults.fields,
          supplierId: "required",
          customerId: "notApplicable",
          variantSetId: "optional",
          externalStepType: "notApplicable",
        },
      };
    case "FINISHED":
      return {
        fields: {
          ...defaults.fields,
          supplierId: "notApplicable",
          customerId: "required",
          variantSetId: "optional",
          externalStepType: "notApplicable",
        },
      };
    case "CMT":
      return {
        fields: {
          ...defaults.fields,
          supplierId: "notApplicable",
          customerId: "required",
          variantSetId: "optional",
          externalStepType: "notApplicable",
        },
      };
    case "SERVICE":
      return {
        fields: {
          ...defaults.fields,
          templateId: "notApplicable",
          supplierId: "recommended",
          customerId: "optional",
          categoryId: "required",
          externalStepType: "recommended",
          variantSetId: "notApplicable",
        },
      };
    default:
      return defaults;
  }
}

export const productRequirementSpec = baseSpec;
