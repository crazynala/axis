import type { FieldConfig } from "./fieldConfigShared";
export { renderField } from "./fieldConfigShared";

// Shipment primary fields (editable subset + read-only associations)
export const shipmentMainFields: FieldConfig[] = [
  {
    name: "id",
    label: "ID",
    widget: "idStatic",
    editable: false,
    readOnly: true,
    findOp: "equals",
  },
  { name: "date", label: "Date", type: "date", findOp: "equals" },
  {
    name: "dateReceived",
    label: "Date Received",
    type: "date",
    findOp: "equals",
  },
  { name: "type", label: "Type", findOp: "contains" },
  {
    name: "shipmentType",
    label: "Ship Type",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  { name: "status", label: "Status", findOp: "contains" },
  { name: "trackingNo", label: "Tracking", findOp: "contains" },
  { name: "packingSlipCode", label: "Packing Slip", findOp: "contains" },
  // Associations read-only in edit, but searchable text contains for now
  {
    name: "carrierName",
    label: "Carrier",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  {
    name: "senderName",
    label: "Sender",
    editable: false,
    readOnly: true,
    findOp: "contains",
  },
  {
    name: "receiverName",
    label: "Receiver",
    editable: false,
    readOnly: true,
    findOp: "contains",
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
  return [...shipmentMainFields];
}
