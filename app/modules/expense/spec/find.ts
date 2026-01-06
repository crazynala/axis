import { deriveSemanticKeys } from "~/base/index/indexController";
import { allExpenseFindFields } from "../forms/expenseDetail";

export const buildExpenseFindConfig = () => allExpenseFindFields();

export const deriveExpenseSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildExpenseFindConfig()));

export const expenseFind = {
  buildConfig: buildExpenseFindConfig,
  deriveSemanticKeys: deriveExpenseSemanticKeys,
};
