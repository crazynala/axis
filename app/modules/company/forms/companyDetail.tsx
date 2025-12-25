import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { TextInput, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { Controller, type UseFormReturn } from "react-hook-form";
export { renderField } from "~/base/forms/fieldConfigShared";

function LeadTimeInput({ form }: { form: UseFormReturn<any> }) {
  return (
    <Controller
      control={form.control}
      name="defaultLeadTimeDays"
      render={({ field }) => (
        <TextInput
          label="Default lead time (days)"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 14"
          value={field.value ?? ""}
          onChange={(e) => field.onChange(e.currentTarget.value)}
          rightSection={
            <Tooltip
              label="Used when product or costing has no override"
              withArrow
              maw={260}
            >
              <IconInfoCircle
                size={16}
                stroke={1.5}
                style={{ cursor: "help" }}
              />
            </Tooltip>
          }
        />
      )}
    />
  );
}

export const companyPanelOneFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "name", label: "Name", findOp: "contains" },
  {
    name: "shortCode",
    label: "Short code",
    findOp: "contains",
    hiddenInModes: ["find"],
  },
  {
    name: "shortName",
    label: "Short name",
    findOp: "contains",
    hiddenInModes: ["find"],
  },
  {
    name: "projectCodeNextNumber",
    label: "Next project code #",
    widget: "text",
    hiddenInModes: ["find"],
  },
  { name: "notes", label: "Notes", findOp: "contains" },
  { name: "isCarrier", label: "Carrier", widget: "triBool", findOp: "equals" },
  {
    name: "isCustomer",
    label: "Customer",
    widget: "triBool",
    findOp: "equals",
  },

  {
    name: "isSupplier",
    label: "Supplier",
    widget: "triBool",
    findOp: "equals",
  },
  {
    name: "isInactive",
    label: "Archived",
    widget: "triBool",
    findOp: "equals",
  },
];

export const companyPanelTwoFields: FieldConfig[] = [
  {
    name: "isConsignee",
    label: "Consignee",
    widget: "triBool",
    findOp: "equals",
    showIf: ({ form }) => !!(form.getValues() as any)?.isCustomer,
    hiddenInModes: ["find"],
  },
  {
    name: "defaultLeadTimeDays",
    label: "Default lead time (days)",
    hiddenInModes: ["find"],
    showIf: ({ form }) => !!(form.getValues() as any)?.isSupplier,
    render: ({ form }) => <LeadTimeInput form={form as any} />,
  },
  {
    name: "defaultMarginOverride",
    label: "Default Margin Override",
    widget: "text",
    showIf: ({ form }) => !!(form.getValues() as any)?.isSupplier,
    hiddenInModes: ["find"],
  },
  {
    name: "stockLocationId",
    label: "Stock Location",
    widget: "select",
    optionsKey: "location",
    showIf: ({ form }) => !!(form.getValues() as any)?.isCustomer,
    hiddenInModes: ["find"],
  },
  {
    name: "invoiceBillUpon",
    label: "Invoice Upon",
    widget: "select",
    options: [
      { value: "Ship", label: "Ship" },
      { value: "Make", label: "Finish" },
    ],
    showIf: ({ form }) => !!(form.getValues() as any)?.isCustomer,
    hiddenInModes: ["find"],
  },
  {
    name: "invoicePercentOnCut",
    label: "Invoice / Cut",
    placeholder: "50%",
    widget: "text",
    showIf: ({ form }) => !!(form.getValues() as any)?.isCustomer,
    hiddenInModes: ["find"],
  },
  {
    name: "invoicePercentOnOrder",
    label: "Invoice / Order",
    widget: "text",
    showIf: ({ form }) => !!(form.getValues() as any)?.isCustomer,
    hiddenInModes: ["find"],
  },
];

export function allCompanyFindFields() {
  return [...companyPanelOneFields, ...companyPanelTwoFields];
}
