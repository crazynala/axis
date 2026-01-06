import { deriveSemanticKeys } from "~/base/index/indexController";
import * as jobDetail from "../forms/jobDetail";

export const buildJobFindConfig = () => [
  ...((jobDetail as any).jobOverviewFields || []),
  ...((jobDetail as any).jobDateStatusLeft || []),
  ...((jobDetail as any).jobDateStatusRight || []),
  ...((jobDetail as any).assemblyFields || []),
];

export const deriveJobSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildJobFindConfig()));

export const jobFind = {
  buildConfig: buildJobFindConfig,
  deriveSemanticKeys: deriveJobSemanticKeys,
};
