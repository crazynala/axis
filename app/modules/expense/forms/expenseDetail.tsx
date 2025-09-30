import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { RenderField, RenderGroup } from "~/base/forms/fieldConfigShared";

export const expenseMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "date", label: "Date", type: "date", findOp: "equals" },
  { name: "category", label: "Category", findOp: "contains" },
  { name: "details", label: "Details", findOp: "contains" },
  { name: "memo", label: "Memo", findOp: "contains" },
  { name: "priceCost", label: "Cost", widget: "numberRange", findOp: "range" },
  { name: "priceSell", label: "Sell", widget: "numberRange", findOp: "range" },
];

export function allExpenseFindFields() {
  return [...expenseMainFields];
}
