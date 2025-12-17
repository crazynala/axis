import type { DebugExplainPayload } from "~/modules/debug/types";
import { prisma } from "~/utils/prisma.server";
import { getDebugVersion, capArray } from "~/modules/debug/debugUtils.server";
import { deriveExternalStepTypeFromCategoryCode } from "~/modules/product/rules/productTypeRules";

export async function buildProductDebug(
  productId: number
): Promise<DebugExplainPayload | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      supplier: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true } },
      category: { select: { id: true, label: true, code: true } },
      subCategory: { select: { id: true, label: true, code: true } },
      template: {
        select: {
          id: true,
          code: true,
          label: true,
          productType: true,
          defaultExternalStepType: true,
          requiresSupplier: true,
          requiresCustomer: true,
          defaultStockTracking: true,
          defaultBatchTracking: true,
          skuSeriesKey: true,
        },
      },
      productLines: {
        include: {
          child: {
            select: {
              id: true,
              sku: true,
              name: true,
              type: true,
              externalStepType: true,
              template: {
                select: { id: true, code: true, label: true, defaultExternalStepType: true },
              },
              category: { select: { id: true, label: true, code: true } },
              subCategory: { select: { id: true, label: true, code: true } },
            },
          },
        },
      },
    },
  });
  if (!product) return null;

  const categoryCode = product.category?.code ?? null;
  const derivedFromCategory = categoryCode
    ? deriveExternalStepTypeFromCategoryCode(categoryCode)
    : null;
  const derivedFromSubCategory = product.subCategory?.code
    ? deriveExternalStepTypeFromCategoryCode(product.subCategory.code)
    : null;
  const derivedExternalStepType =
    product.externalStepType ??
    product.template?.defaultExternalStepType ??
    derivedFromSubCategory ??
    derivedFromCategory ??
    null;

  const lineSummaries = (product.productLines || []).map((line) => ({
    id: line.id,
    childId: line.child?.id ?? null,
    childSku: line.child?.sku ?? null,
    childName: line.child?.name ?? null,
    childType: line.child?.type ?? null,
    childExternalStepType: line.child?.externalStepType ?? null,
    childTemplate: line.child?.template
      ? {
          id: line.child.template.id,
          code: line.child.template.code,
          label: line.child.template.label,
          defaultExternalStepType: line.child.template.defaultExternalStepType,
        }
      : null,
    childCategory: line.child?.category
      ? { id: line.child.category.id, label: line.child.category.label, code: line.child.category.code }
      : null,
    childSubCategory: line.child?.subCategory
      ? {
          id: line.child.subCategory.id,
          label: line.child.subCategory.label,
          code: line.child.subCategory.code,
        }
      : null,
  }));
  const { items: cappedLines, truncated } = capArray(lineSummaries);

  const reasons = [];
  if (!product.externalStepType && (derivedFromCategory || derivedFromSubCategory)) {
    reasons.push({
      code: "EXTERNAL_STEP_DERIVED",
      label: "External step implied by category",
      why: "Product externalStepType is not set, but category/subcategory suggests an external step.",
      evidence: {
        categoryCode,
        subCategoryCode: product.subCategory?.code ?? null,
        derivedFromCategory,
        derivedFromSubCategory,
      },
    });
  }

  return {
    context: {
      module: "product",
      entity: { type: "Product", id: product.id },
      generatedAt: new Date().toISOString(),
      version: getDebugVersion(),
    },
    inputs: {
      id: product.id,
      sku: product.sku ?? null,
      name: product.name ?? null,
      type: product.type ?? null,
      externalStepType: product.externalStepType ?? null,
      template: product.template ?? null,
      category: product.category ?? null,
      subCategory: product.subCategory ?? null,
      supplier: product.supplier ?? null,
      customer: product.customer ?? null,
      stockTrackingEnabled: product.stockTrackingEnabled ?? null,
      batchTrackingEnabled: product.batchTrackingEnabled ?? null,
      leadTimeDays: product.leadTimeDays ?? null,
      flagIsDisabled: product.flagIsDisabled ?? null,
      createdAt: product.createdAt ?? null,
      updatedAt: product.updatedAt ?? null,
    },
    derived: {
      derivedExternalStepType,
      derivedFromCategory,
      derivedFromSubCategory,
      productLines: cappedLines,
      productLinesTruncated: truncated,
    },
    reasoning: reasons.length ? reasons : undefined,
    links: [{ label: `Product ${product.id}`, href: `/products/${product.id}` }],
  };
}
