import type { FieldConfig } from "~/base/forms/fieldConfigShared";
export { renderField } from "~/base/forms/fieldConfigShared";

// Shipment primary fields (editable subset + read-only associations)
export const shipmentInfoFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "type", label: "Type", findOp: "contains" },
  { name: "trackingNo", label: "AWB / Tracking", findOp: "contains" },
  { name: "packingSlipCode", label: "Packing Slip", findOp: "contains" },
  { name: "date", label: "Date", type: "date", findOp: "equals" },

  { name: "status", label: "Status", findOp: "contains" },
];

export const shipmentAddressFields: FieldConfig[] = [
  { name: "addressName", label: "Address Name", findOp: "contains" },
  { name: "addressLine1", label: "Address Line 1", findOp: "contains" },
  { name: "addressLine2", label: "Address Line 2", findOp: "contains" },
  { name: "addressCity", label: "City", findOp: "contains" },
  { name: "addressCountyState", label: "County/State", findOp: "contains" },
  { name: "addressPostalCode", label: "Postal Code", findOp: "contains" },
  { name: "addressCountry", label: "Country", findOp: "contains" },
];

export const shipmentDetailFields: FieldConfig[] = [
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
    name: "companyIdSender",
    label: "Sender",
    widget: "select",
    optionsKey: "supplier",
    findOp: "contains",
    showIf: ({ form, mode }) => {
      // In edit mode, honor dynamic visibility based on shipment type
      // In find mode, show both fields so users can filter on either
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "In";
    },
  },
  {
    name: "companyIdReceiver",
    label: "Receiver",
    widget: "select",
    optionsKey: "customer",
    findOp: "contains",
    showIf: ({ form, mode }) => {
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "Out";
    },
  },
  {
    name: "locationName",
    label: "Location",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
];

export function allShipmentFindFields() {
  // showIf returns true in find mode, so both sender/receiver are included
  return [...shipmentInfoFields, ...shipmentDetailFields];
}
