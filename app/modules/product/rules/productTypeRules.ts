export type ProductRules = {
  categoryGroupCode: string;
  showSupplier: boolean;
  requireSupplier: boolean;
  showCustomer: boolean;
  requireCustomer: boolean;
  showExternalStepType: boolean;
  requireExternalStepType: boolean;
  defaultStockTracking: boolean;
  defaultBatchTracking: boolean;
  allowBom: boolean;
};

type ProductTypeString =
  | "FABRIC"
  | "TRIM"
  | "PACKAGING"
  | "FINISHED"
  | "CMT"
  | "SERVICE";

export function rulesForType(typeRaw: any): ProductRules {
  const type = String(typeRaw || "").toUpperCase() as ProductTypeString;

  switch (type) {
    case "FABRIC":
      return {
        categoryGroupCode: "FABRIC",
        showSupplier: true,
        requireSupplier: true,
        showCustomer: false,
        requireCustomer: false,
        showExternalStepType: false,
        requireExternalStepType: false,
        defaultStockTracking: true,
        defaultBatchTracking: true,
        allowBom: false,
      };
    case "TRIM":
      return {
        categoryGroupCode: "TRIM",
        showSupplier: true,
        requireSupplier: true,
        showCustomer: true,
        requireCustomer: false,
        showExternalStepType: false,
        requireExternalStepType: false,
        defaultStockTracking: true,
        defaultBatchTracking: false,
        allowBom: false,
      };
    case "PACKAGING":
      return {
        categoryGroupCode: "PACKAGING",
        showSupplier: true,
        requireSupplier: true,
        showCustomer: false,
        requireCustomer: false,
        showExternalStepType: false,
        requireExternalStepType: false,
        defaultStockTracking: true,
        defaultBatchTracking: false,
        allowBom: false,
      };
    case "FINISHED":
      return {
        categoryGroupCode: "FINISHED",
        showSupplier: false,
        requireSupplier: false,
        showCustomer: true,
        requireCustomer: true,
        showExternalStepType: false,
        requireExternalStepType: false,
        defaultStockTracking: false,
        defaultBatchTracking: false,
        allowBom: true,
      };
    case "CMT":
      return {
        categoryGroupCode: "CMT",
        showSupplier: false,
        requireSupplier: false,
        showCustomer: true,
        requireCustomer: true,
        showExternalStepType: false,
        requireExternalStepType: false,
        defaultStockTracking: false,
        defaultBatchTracking: false,
        allowBom: false,
      };
    case "SERVICE":
    default:
      return {
        categoryGroupCode: "SERVICE",
        showSupplier: true,
        requireSupplier: false,
        showCustomer: true,
        requireCustomer: false,
        showExternalStepType: true,
        requireExternalStepType: false,
        defaultStockTracking: false,
        defaultBatchTracking: false,
        allowBom: false,
      };
  }
}

export type ExternalStepTypeString = "EMBROIDERY" | "WASH" | "DYE";

export function deriveExternalStepTypeFromCategoryCode(
  categoryCodeRaw: string | null | undefined
): ExternalStepTypeString | null {
  const code = String(categoryCodeRaw || "").toUpperCase();
  if (code === "OUTSIDE_WASH") return "WASH";
  if (code === "OUTSIDE_DYE") return "DYE";
  if (code === "OUTSIDE_EMBROIDERY") return "EMBROIDERY";
  return null;
}
