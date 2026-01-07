import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { f, mod, policy } from "~/base/forms/cfg";
export { renderField } from "~/base/forms/fieldConfigShared";

const isLockedOnEdit = ({
  mode,
  ctx,
}: {
  mode: "edit" | "find" | "create";
  ctx?: any;
}) => mode === "edit" && !ctx?.isLoudMode;
const lockWhenNotDraft = policy.lockWhenNotDraft(isLockedOnEdit);

const vendorField: FieldConfig = lockWhenNotDraft(
  mod.inline(1)(f.select("companyId", "Vendor", "supplier", { findOp: "equals" }))
);
const dateField: FieldConfig = lockWhenNotDraft(
  f.date("date", "Date", { findOp: "equals", flex: 1 })
);
const consigneeField: FieldConfig = lockWhenNotDraft(
  mod.inline(1)(
    f.select("consigneeCompanyId", "Consignee", "consignee", {
      allOptionsKey: "consigneeAll",
      findOp: "equals",
    })
  )
);
const locationField: FieldConfig = f.select(
  "locationId",
  "Location",
  "location",
  {
    editable: false,
    readOnly: true,
    hiddenInModes: ["create"],
    flex: 1,
  }
);
const memoField: FieldConfig = lockWhenNotDraft(
  f.text("memo", "Memo", { findOp: "contains" })
);
const idField: FieldConfig = mod.hide("create")(f.id("id", "ID"));

export const purchaseOrderMainFields: FieldConfig[] = [
  vendorField,
  dateField,
  consigneeField,
  locationField,
  memoField,
  idField,
];

export function allPurchaseOrderFindFields() {
  return [...purchaseOrderMainFields];
}
