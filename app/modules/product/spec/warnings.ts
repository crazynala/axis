import { computeProductValidation } from "../validation/computeProductValidation";
import { rulesForType } from "../rules/productTypeRules";

export type ProductWarning = {
  code: string;
  severity: "error" | "warn" | "info";
  label: string;
};

export type ProductWarningsInput = {
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
  stockTrackingEnabled?: boolean | null;
  batchTrackingEnabled?: boolean | null;
  hasCmtLine?: boolean;
};

export function shouldWarnMissingCmtLine(
  type: string | null | undefined,
  hasCmtLine: boolean | null | undefined
) {
  const isFinished = String(type || "").toUpperCase() === "FINISHED";
  return isFinished && hasCmtLine === false;
}

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
  const type = String(input.type || "").toUpperCase();
  const isFinished = type === "FINISHED";
  const stockTrackingEnabled = Boolean(input.stockTrackingEnabled);
  const batchTrackingEnabled = Boolean(input.batchTrackingEnabled);
  const requiresStockTracking = Boolean(rules.defaultStockTracking);
  const requiresBatchTracking = Boolean(rules.defaultBatchTracking);

  if (!stockTrackingEnabled && requiresStockTracking) {
    warnings.push({
      code: "enable_stock",
      severity: "warn",
      label: "Enable Stock",
    });
  }

  if (stockTrackingEnabled && !batchTrackingEnabled) {
    if (isFinished) {
      warnings.push({
        code: "batch_tracking_off",
        severity: "error",
        label: "Batch Tracking Off",
      });
    } else if (requiresBatchTracking) {
      warnings.push({
        code: "enable_batch",
        severity: "warn",
        label: "Enable Batch",
      });
    }
  }

  if (shouldWarnMissingCmtLine(input.type, input.hasCmtLine)) {
    warnings.push({
      code: "no_cmt_on_bom",
      severity: "error",
      label: "No CMT on BOM",
    });
  }

  return warnings;
}

export const productWarnings = {
  buildProductWarnings,
  shouldWarnMissingCmtLine,
};
