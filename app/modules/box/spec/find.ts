import { deriveSemanticKeys } from "~/base/index/indexController";
import { allBoxFieldConfigs } from "../forms/boxDetail";

export const buildBoxFindConfig = () => allBoxFieldConfigs();

export const deriveBoxSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildBoxFindConfig()));

export const boxFind = {
  buildConfig: buildBoxFindConfig,
  deriveSemanticKeys: deriveBoxSemanticKeys,
};
