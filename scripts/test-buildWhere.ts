#!/usr/bin/env ts-node
import { buildWhereFromConfig } from "../app/utils/buildWhereFromConfig.server";
import type { FieldConfig } from "../app/formConfigs/fieldConfigShared";

const cfg: FieldConfig[] = [
  { name: "name", label: "Name", findOp: "contains" },
  { name: "sku", label: "SKU", findOp: "equals" },
  {
    name: "stockTrackingEnabled",
    label: "Stock",
    widget: "triBool",
    findOp: "equals",
  },
  { name: "costPrice", label: "Cost", widget: "numberRange", findOp: "range" },
];

const sampleValues = {
  name: "shirt",
  sku: "SKU123",
  stockTrackingEnabled: "true",
  costPriceMin: "10",
  costPriceMax: "25",
};

const where = buildWhereFromConfig(sampleValues, cfg);
console.log(JSON.stringify(where, null, 2));
