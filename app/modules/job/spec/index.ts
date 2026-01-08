import { jobFind } from "./find";
import * as indexList from "./indexList";
import { jobWarnings } from "./warnings";

export const jobSpec = {
  find: jobFind,
  index: indexList,
  warnings: jobWarnings,
};
