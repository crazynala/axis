import type { FieldConfig } from "~/base/forms/fieldConfigShared";
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
    showIf: ({ form, mode }) => {
      if (mode === "find") return true;
      const t = form.getValues()?.type;
      return t === "Out";
    },
  },
  { name: "packingSlipCode", label: "Packing Slip", findOp: "contains" },
  { name: "date", label: "Date", type: "date", findOp: "equals" },

  { name: "status", label: "Status", findOp: "contains" },
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
    inlineWithNext: true,
    flex: 1,
  },
  {
    name: "type",
    label: "Type",
    findOp: "contains",
    editable: false,
    readOnly: true,
    flex: 1,
  },
];

export const shipmentAddressFields: FieldConfig[] = [
  { name: "addressName", label: "Address Name", findOp: "contains" },
  { name: "addressLine1", label: "Address Line 1", findOp: "contains" },
  { name: "addressLine2", label: "Address Line 2", findOp: "contains" },
  {
    name: "addressCity",
    label: "City",
    findOp: "contains",
  },
  {
    name: "addressCountyState",
    label: "County/State",
    findOp: "contains",
  },
  {
    name: "addressPostalCode",
    label: "Postal Code",
    findOp: "contains",
    inlineWithNext: true,
    flex: 1,
  },
  { name: "addressCountry", label: "Country", findOp: "contains", flex: 1 },
];

export const shipmentDetailFields: FieldConfig[] = [
  { name: "trackingNo", label: "AWB / Tracking", findOp: "contains" },
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
  },
];

export function allShipmentFindFields() {
  // showIf returns true in find mode, so both sender/receiver are included
  return [...shipmentInfoFields, ...shipmentDetailFields];
}
