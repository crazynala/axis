import { deriveSemanticKeys } from "~/base/index/indexController";
import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { allProductFindFields } from "./forms";

export const buildProductFindConfig = (extraFields: FieldConfig[] = []) =>
  allProductFindFields(extraFields);

export const deriveProductSemanticKeys = (extraFields: FieldConfig[] = []) =>
  new Set(deriveSemanticKeys(buildProductFindConfig(extraFields)));

export const productFind = {
  buildConfig: buildProductFindConfig,
  deriveSemanticKeys: deriveProductSemanticKeys,
};
