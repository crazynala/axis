import { productFields } from "./fields";
import { productForms } from "./forms";
import { productFind } from "./find";
import { productIndexList } from "./indexList";
import { productWarnings } from "./warnings";

export const productSpec = {
  fields: productFields,
  forms: productForms,
  find: productFind,
  index: productIndexList,
  warnings: productWarnings,
};

export type { ProductSpec } from "./types";
