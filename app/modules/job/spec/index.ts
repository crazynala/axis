import { jobFind } from "./find";
import * as indexList from "./indexList";
import { jobSheetSpec } from "./sheets";
import { jobWarnings } from "./warnings";

export const jobSpec = {
  find: jobFind,
  index: indexList,
  sheet: jobSheetSpec,
  warnings: jobWarnings,
};
