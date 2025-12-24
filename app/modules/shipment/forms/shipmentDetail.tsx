import type { FieldConfig } from "~/base/forms/fieldConfigShared";
import { AddressPickerField } from "~/components/addresses/AddressPickerField";
export { renderField } from "~/base/forms/fieldConfigShared";

// Shipment primary fields (editable subset + read-only associations)
export const shipmentInfoFields: FieldConfig[] = [
  // Company and Contact selectors (left panel)
  {
    name: "companyIdSender",
    label: "Sender Company",
    widget: "select",
    optionsKey: "supplier",
    findOp: "contains",
    showIf: ({ form, mode }) => {
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "In"; // inbound receive: supplier is sender
    },
  },
  {
    name: "companyIdReceiver",
    label: "Recv Company",
    widget: "select",
    optionsKey: "customer",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
    showIf: ({ form, mode }) => {
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "Out"; // outbound ship: customer is receiver
    },
  },
  {
    name: "contactIdReceiver",
    label: "Recv Contact",
    widget: "select",
    optionsKey: "contact",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
    showIf: ({ form, mode }) => {
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "Out";
    },
  },
  { name: "packingSlipCode", label: "Packing Slip", findOp: "contains" },
  { name: "date", label: "Date", type: "date", findOp: "equals" },

  {
    name: "status",
    label: "Status",
    findOp: "contains",
    editable: false,
    readOnly: true,
    showIf: ({ mode }) => mode !== "create",
  },
  {
    name: "packMode",
    label: "Pack Mode",
    widget: "select",
    options: [
      { value: "line", label: "Lines" },
      { value: "box", label: "Boxes" },
    ],
    hiddenInModes: ["find"],
    readOnlyIf: ({ ctx }) => Boolean(ctx?.packModeLocked),
  },
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
    inlineWithNext: true,
    flex: 1,
    showIf: ({ mode }) => mode !== "create",
  },
  {
    name: "type",
    label: "Type",
    findOp: "contains",
    editable: false,
    readOnly: true,
    flex: 1,
    showIf: ({ mode }) => mode !== "create",
  },
];

export const shipmentAddressFields: FieldConfig[] = [
  {
    name: "addressIdShip",
    render: ({ form, ctx }) => {
      const options = ctx?.fieldOptions?.address_shipto ?? [];
      const addressId = form.watch("addressIdShip") as number | null;
      const previewAddress = {
        name: form.watch("addressName"),
        addressLine1: form.watch("addressLine1"),
        addressLine2: form.watch("addressLine2"),
        addressLine3: form.watch("addressLine3"),
        addressTownCity: form.watch("addressTownCity") || form.watch("addressCity"),
        addressCountyState: form.watch("addressCountyState"),
        addressZipPostCode:
          form.watch("addressZipPostCode") || form.watch("addressPostalCode"),
        addressCountry: form.watch("addressCountry"),
      };
      return (
        <AddressPickerField
          label="Ship-To Address"
          value={addressId ?? null}
          options={options}
          previewAddress={previewAddress}
          onChange={(nextId) => form.setValue("addressIdShip", nextId)}
          disabled={Boolean(ctx?.shipmentLocked)}
        />
      );
    },
  },
  {
    name: "addressName",
    label: "Address Name",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressLine1",
    label: "Address Line 1",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressLine2",
    label: "Address Line 2",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressCity",
    label: "City",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressCountyState",
    label: "County/State",
    findOp: "contains",
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressPostalCode",
    label: "Postal Code",
    findOp: "contains",
    inlineWithNext: true,
    flex: 1,
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
  {
    name: "addressCountry",
    label: "Country",
    findOp: "contains",
    flex: 1,
    readOnlyIf: ({ ctx }) => Boolean(ctx?.shipmentLocked),
  },
];

export const shipmentDetailFields: FieldConfig[] = [
  {
    name: "trackingNo",
    label: "AWB / Tracking",
    findOp: "contains",
    showIf: ({ mode }) => mode !== "create",
  },
  {
    name: "shipmentType",
    label: "Ship Type",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  {
    name: "companyIdCarrier",
    label: "Carrier",
    findOp: "contains",
    widget: "select",
    optionsKey: "carrier",
  },
  {
    name: "locationName",
    label: "Location",
    editable: false,
    readOnly: true,
    findOp: "contains",
    showIf: ({ mode }) => mode !== "create",
  },
];

export function allShipmentFindFields() {
  // showIf returns true in find mode, so both sender/receiver are included
  return [...shipmentInfoFields, ...shipmentDetailFields];
}
