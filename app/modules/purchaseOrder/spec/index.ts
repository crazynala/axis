import { purchaseOrderFind } from "./find";
import * as indexList from "./indexList";
import { purchaseOrderWarnings } from "./warnings";

export const purchaseOrderSpec = {
  find: purchaseOrderFind,
  index: indexList,
  warnings: purchaseOrderWarnings,
};
