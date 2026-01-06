import { deriveSemanticKeys } from "~/base/index/indexController";
import { allShipmentFindFields } from "../forms/shipmentDetail";

export const buildShipmentFindConfig = () => allShipmentFindFields();

export const deriveShipmentSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildShipmentFindConfig()));

export const shipmentFind = {
  buildConfig: buildShipmentFindConfig,
  deriveSemanticKeys: deriveShipmentSemanticKeys,
};
