import { useCallback } from "react";
import { useBaseFindify } from "~/base/find/baseFindify";
import type { BoxFindValues } from "./box.search-schema";

export type BoxFormValues = {
  id?: number | string | null;
  code: string;
  description: string;
  state: string;
  notes: string;
  companyId?: number | null;
  locationId?: number | null;
  shipmentId?: number | null;
  warehouseNumber?: number | null;
  shipmentNumber?: number | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  warehouseNumberMin?: number | null;
  warehouseNumberMax?: number | null;
  shipmentNumberMin?: number | null;
  shipmentNumberMax?: number | null;
  lineProductSku?: string | null;
  lineProductName?: string | null;
  lineProductId?: number | null;
  lineJobId?: number | null;
  lineAssemblyId?: number | null;
  lineBatchId?: number | null;
};

export function buildBoxEditDefaults(box: any): BoxFormValues {
  if (!box) {
    return buildBoxFindDefaults();
  }
  return {
    id: box.id ?? null,
    code: box.code ?? "",
    description: box.description ?? "",
    state: box.state ?? "open",
    notes: box.notes ?? "",
    companyId: box.companyId ?? null,
    locationId: box.locationId ?? null,
    shipmentId: box.shipmentId ?? null,
    warehouseNumber:
      box.warehouseNumber != null ? Number(box.warehouseNumber) : null,
    shipmentNumber:
      box.shipmentNumber != null ? Number(box.shipmentNumber) : null,
    createdAt: box.createdAt ? new Date(box.createdAt) : null,
    updatedAt: box.updatedAt ? new Date(box.updatedAt) : null,
    warehouseNumberMin: null,
    warehouseNumberMax: null,
    shipmentNumberMin: null,
    shipmentNumberMax: null,
    lineProductSku: null,
    lineProductName: null,
    lineProductId: null,
    lineJobId: null,
    lineAssemblyId: null,
    lineBatchId: null,
  };
}

export function buildBoxFindDefaults(): BoxFormValues {
  return {
    id: null,
    code: "",
    description: "",
    state: "",
    notes: "",
    companyId: null,
    locationId: null,
    shipmentId: null,
    warehouseNumber: null,
    shipmentNumber: null,
    createdAt: null,
    updatedAt: null,
    warehouseNumberMin: null,
    warehouseNumberMax: null,
    shipmentNumberMin: null,
    shipmentNumberMax: null,
    lineProductSku: "",
    lineProductName: "",
    lineProductId: null,
    lineJobId: null,
    lineAssemblyId: null,
    lineBatchId: null,
  } as BoxFormValues;
}

export function useBoxFindify(record: any, nav?: { state: string }) {
  const { editForm, findForm, mode, enterFind, exitFind, toggleFind } =
    useBaseFindify<BoxFormValues, BoxFormValues>({
      buildEditDefaults: buildBoxEditDefaults,
      buildFindDefaults: buildBoxFindDefaults,
      record,
      navState: nav?.state,
    });

  const buildUpdatePayload = useCallback((values: BoxFormValues) => {
    const fd = new FormData();
    fd.set("_intent", "update");
    const put = (key: string, value: unknown) => {
      if (value === undefined || value === null || value === "") {
        fd.set(key, "");
      } else {
        fd.set(key, String(value));
      }
    };
    put("code", values.code);
    put("description", values.description);
    put("state", values.state || "open");
    put("notes", values.notes);
    put("companyId", values.companyId);
    put("locationId", values.locationId);
    put("shipmentId", values.shipmentId);
    put("warehouseNumber", values.warehouseNumber);
    put("shipmentNumber", values.shipmentNumber);
    return fd;
  }, []);

  const buildFindPayload = useCallback((values: BoxFindValues) => {
    const fd = new FormData();
    fd.set("_intent", "find");
    const put = (key: string, value: unknown) => {
      if (value === undefined || value === null || value === "") return;
      fd.set(key, String(value));
    };
    put("id", values.id);
    put("code", values.code);
    put("description", values.description);
    put("state", values.state);
    put("notes", values.notes);
    put("companyId", values.companyId);
    put("locationId", values.locationId);
    put("shipmentId", values.shipmentId);
    put("warehouseNumberMin", values.warehouseNumberMin);
    put("warehouseNumberMax", values.warehouseNumberMax);
    put("shipmentNumberMin", values.shipmentNumberMin);
    put("shipmentNumberMax", values.shipmentNumberMax);
    put("lineProductSku", values.lineProductSku);
    put("lineProductName", values.lineProductName);
    put("lineProductId", values.lineProductId);
    put("lineJobId", values.lineJobId);
    put("lineAssemblyId", values.lineAssemblyId);
    put("lineBatchId", values.lineBatchId);
    return fd;
  }, []);

  return {
    editForm,
    findForm,
    mode,
    enterFind,
    exitFind,
    toggleFind,
    buildUpdatePayload,
    buildFindPayload,
  };
}
