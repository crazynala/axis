import React from "react";
import type { UseFormReturn } from "react-hook-form";
import { DatePickerInput } from "@mantine/dates";
import {
  TextInput,
  Select,
  Group,
  Button,
  SegmentedControl,
} from "@mantine/core";

export type FieldMode = "edit" | "find";

export type WidgetType =
  | "text"
  | "date"
  | "idStatic"
  | "customerPicker"
  | "categorySelect"
  | "taxCodeSelect"
  | "triBool" // three-state boolean (true/false/any)
  | "numberRange"; // renders two inputs: min/max in find mode or single number in edit

export interface FieldConfig {
  name: string;
  label: string;
  editable?: boolean;
  type?: "text" | "date" | "number"; // legacy
  widget?: WidgetType;
  hiddenInModes?: FieldMode[];
  findPlaceholder?: string;
  findOp?: "contains" | "equals" | "range" | "gte" | "lte";
  readOnly?: boolean;
  // For numberRange widget only: underlying field names for min/max in find mode
  rangeFields?: { min: string; max: string };
  // Optional: custom render override
  render?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    record: any;
    ctx?: RenderContext;
  }) => React.ReactElement | null;
  // Select options provider (could evolve async later)
  options?: { value: string; label: string }[];
}

export interface RenderContext {
  openCustomerModal?: () => void;
  // Future: category lists, tax codes, etc.
  categoryOptions?: { value: string; label: string }[];
  taxCodeOptions?: { value: string; label: string }[];
  customerOptions?: { value: string; label: string }[];
}

export function renderField(
  form: UseFormReturn<any>,
  field: FieldConfig,
  mode: FieldMode,
  record: any,
  ctx?: RenderContext
) {
  if (field.hiddenInModes && field.hiddenInModes.includes(mode)) return null;
  if (field.render) return field.render({ form, mode, field, record, ctx });
  const widget = field.widget || (field.type === "date" ? "date" : "text");
  const common: any = { label: field.label };

  switch (widget) {
    case "idStatic":
      if (mode === "find") {
        return (
          <TextInput
            {...common}
            placeholder={field.findPlaceholder || "equals…"}
            {...form.register(field.name as any)}
          />
        );
      }
      return (
        <TextInput
          {...common}
          mod="autoSize"
          readOnly
          value={record?.[field.name] != null ? String(record[field.name]) : ""}
        />
      );
    case "customerPicker": {
      if (mode === "find") {
        return (
          <TextInput
            {...common}
            mod="autoSize"
            placeholder={field.findPlaceholder || "contains…"}
            {...form.register(field.name as any)}
          />
        );
      }
      // Inline searchable select using provided customer options list if available
      const options = (ctx as any)?.customerOptions?.length
        ? (ctx as any).customerOptions
        : record?.company
        ? [
            {
              value: String(record.company.id),
              label: record.company.name || String(record.company.id),
            },
          ]
        : [];
      return (
        <Select
          {...common}
          searchable
          clearable
          mod="autoSize"
          data={options}
          value={
            form.watch(field.name as any) ??
            (record?.company?.id ? String(record.company.id) : null)
          }
          onChange={(val) => {
            // store ID as number when possible
            const num = val != null && val !== "" ? Number(val) : undefined;
            form.setValue(field.name as any, num as any, { shouldDirty: true });
          }}
          placeholder="Select customer…"
        />
      );
    }
    case "date":
      if (mode === "find") {
        return (
          <TextInput
            {...common}
            mod="autoSize"
            placeholder={field.findPlaceholder || "yyyy-mm-dd"}
            {...form.register(field.name as any)}
          />
        );
      }
      const val = record?.[field.name];
      return (
        <DatePickerInput
          {...common}
          mod="autoSize"
          value={val ? new Date(val) : null}
          onChange={(d) => form.setValue(field.name as any, d as any)}
        />
      );
    case "categorySelect":
    case "taxCodeSelect": {
      const opts =
        field.options ||
        (widget === "categorySelect"
          ? ctx?.categoryOptions || []
          : ctx?.taxCodeOptions || []);
      if (mode === "find") {
        return (
          <Select
            {...common}
            searchable
            clearable
            data={opts}
            placeholder={field.findPlaceholder || "any"}
            {...form.register(field.name as any)}
          />
        );
      }
      return (
        <Select
          {...common}
          data={opts}
          searchable
          clearable
          value={record?.[field.name] ?? null}
          onChange={(v) => form.setValue(field.name as any, v)}
        />
      );
    }
    case "triBool": {
      // Represent tri-state with segmented control (Any/Yes/No) in find; toggle in edit
      const value = form.watch(field.name as any);
      if (mode === "find") {
        return (
          <SegmentedControl
            fullWidth
            data={[
              { label: `${field.label}: Any`, value: "" },
              { label: "Yes", value: "true" },
              { label: "No", value: "false" },
            ]}
            value={value ?? ""}
            onChange={(v) => form.setValue(field.name as any, v)}
          />
        );
      }
      return (
        <SegmentedControl
          fullWidth
          data={[
            { label: "Unset", value: "" },
            { label: "Yes", value: "true" },
            { label: "No", value: "false" },
          ]}
          value={value ?? ""}
          onChange={(v) => form.setValue(field.name as any, v)}
        />
      );
    }
    case "numberRange": {
      if (mode === "find") {
        const minField = field.rangeFields?.min || `${field.name}Min`;
        const maxField = field.rangeFields?.max || `${field.name}Max`;
        return (
          <Group gap="xs" align="flex-end" style={{ alignItems: "flex-end" }}>
            <TextInput
              label={field.label + " Min"}
              mod="autoSize"
              placeholder="min"
              {...form.register(minField as any)}
              style={{ flex: 1 }}
            />
            <TextInput
              label={field.label + " Max"}
              mod="autoSize"
              placeholder="max"
              {...form.register(maxField as any)}
              style={{ flex: 1 }}
            />
          </Group>
        );
      }
      return (
        <TextInput
          {...common}
          mod="autoSize"
          type="number"
          value={record?.[field.name] ?? ""}
          onChange={(e) => form.setValue(field.name as any, e.target.value)}
        />
      );
    }
    default: {
      return (
        <TextInput
          {...common}
          placeholder={
            mode === "find"
              ? field.findPlaceholder ||
                (field.findOp === "equals" ? "equals…" : "contains…")
              : undefined
          }
          mod="autoSize"
          {...form.register(field.name as any)}
          readOnly={
            mode === "edit" && (field.editable === false || field.readOnly)
          }
        />
      );
    }
  }
}

export function extractFindValues(formData: Record<string, any>) {
  // Helper to strip empty triBool and range fields later if needed.
  const cleaned: Record<string, any> = {};
  for (const [k, v] of Object.entries(formData)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    cleaned[k] = v;
  }
  return cleaned;
}
