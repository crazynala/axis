import { deriveSemanticKeys } from "~/base/index/indexController";
import { allPurchaseOrderFindFields } from "../forms/purchaseOrderDetail";

export const buildPurchaseOrderFindConfig = () => allPurchaseOrderFindFields();

export const derivePurchaseOrderSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildPurchaseOrderFindConfig()));

export const purchaseOrderFind = {
  buildConfig: buildPurchaseOrderFindConfig,
  deriveSemanticKeys: derivePurchaseOrderSemanticKeys,
};
