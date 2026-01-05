import { computeProductValidation } from "../validation/computeProductValidation";
import { rulesForType } from "../rules/productTypeRules";

export type ProductWarning = {
  code: string;
  severity: "error" | "warn" | "info";
  label: string;
};

export type ProductWarningsInput = {
  type?: string | null;
  name?: string | null;
  categoryId?: number | string | null;
  templateId?: number | string | null;
  supplierId?: number | string | null;
  customerId?: number | string | null;
  variantSetId?: number | string | null;
  costPrice?: number | string | null;
  leadTimeDays?: number | string | null;
  externalStepType?: string | null;
  stockTrackingEnabled?: boolean | null;
  batchTrackingEnabled?: boolean | null;
  hasCmtLine?: boolean;
};

export function buildProductWarnings(
  input: ProductWarningsInput
): ProductWarning[] {
  const warnings: ProductWarning[] = [];
  const validation = computeProductValidation(input);
  if (validation.missingRequired.length) {
    warnings.push({
      code: "field_missing",
      severity: "warn",
      label: "Field Missing",
    });
  }

  const rules = rulesForType(input.type);
  const stockTrackingEnabled = Boolean(input.stockTrackingEnabled);
  const batchTrackingEnabled = Boolean(input.batchTrackingEnabled);

  if (!stockTrackingEnabled) {
    if (rules.defaultStockTracking) {
      warnings.push({
        code: "enable_stock",
        severity: "warn",
        label: "Enable Stock",
      });
    } else {
      warnings.push({
        code: "stock_tracking_off",
        severity: "info",
        label: "Stock Tracking Off",
      });
    }
  }

  if (stockTrackingEnabled && !batchTrackingEnabled) {
    if (rules.defaultBatchTracking) {
      warnings.push({
        code: "enable_batch",
        severity: "warn",
        label: "Enable Batch",
      });
    } else {
      warnings.push({
        code: "batch_tracking_off",
        severity: "info",
        label: "Batch Tracking Off",
      });
    }
  }

  const isFinished = String(input.type || "") === "Finished";
  const categoryRaw = input.categoryId;
  const hasCategory =
    categoryRaw != null &&
    String(categoryRaw).trim() !== "" &&
    Number.isFinite(Number(categoryRaw));
  const shouldHaveCmt = isFinished && hasCategory;
  if (input.hasCmtLine === false && shouldHaveCmt) {
    warnings.push({
      code: "no_cmt_on_bom",
      severity: "warn",
      label: "No CMT on BOM",
    });
  }

  return warnings;
}
