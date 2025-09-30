import React from "react";
import { Controller, type UseFormReturn } from "react-hook-form";
import { DatePickerInput } from "@mantine/dates";
import {
  TextInput,
  Select,
  Group,
  SegmentedControl,
  Checkbox,
  Indicator,
  Input,
  CloseButton,
} from "@mantine/core";
import { useOptions } from "../options/OptionsContext";
import { IconEditCircle } from "@tabler/icons-react";

export type FieldMode = "edit" | "find" | "create";

export type FieldConfig = {
  name: string;
  label: string;
  widget?:
    | "text"
    | "select"
    | "idStatic"
    | "triBool"
    | "numberRange"
    | "date"
    | "computed"
    | "defaultOverride";
  // optional semantic type hint (e.g., "date") used for defaults
  type?: string;
  findOp?: "contains" | "equals" | "range" | string;
  hiddenInModes?: FieldMode[];
  editable?: boolean;
  readOnly?: boolean;
  findPlaceholder?: string;
  options?: { value: string; label: string }[];
  optionsKey?: string; // maps to ctx.fieldOptions[key]
  rangeFields?: { min?: string; max?: string };
  // computed (display-only) widget props
  deps?: string[]; // names to watch to refresh computed output (RenderGroup already watches all; this can be used for clarity)
  compute?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
    values: any;
  }) => React.ReactNode;
  // defaultOverride widget props
  overrideName?: string; // the editable field name that will be submitted
  defaultName?: string; // fallback: read this field's value when override empty
  computeDefault?: (values: any, ctx?: RenderContext) => any; // or compute default from values
  format?: (v: any) => React.ReactNode; // optional formatter for display
  sticky?: boolean; // if true (default), show override input by default when value present
  inputType?: string; // input type for override editor (e.g., number)
  placeholder?: string;
  // Optional predicate to conditionally display this field
  showIf?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => boolean;
  render?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => React.ReactNode;
  // Optional rightSection content for inputs (ActionIcon, etc.)
  rightSection?: (args: {
    form: UseFormReturn<any>;
    mode: FieldMode;
    field: FieldConfig;
    ctx?: RenderContext;
  }) => React.ReactNode;
};

export type RenderContext = {
  fieldOptions?: Record<string, { value: string; label: string }[]>;
  options?: any; // full OptionsData if available
  openCustomerModal?: () => void;
  [key: string]: any;
};

// Hoisted renderer for defaultOverride to avoid remounting on each parent render
function DefaultOverrideRenderer({
  form,
  field,
  mode,
  ctx,
}: {
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  const common: any = { label: field.label, mod: "data-autosize" };
  const curOverrideName = field.overrideName as string | undefined;
  const sticky = field.sticky ?? true;
  const format = field.format || ((v: any) => (v != null ? String(v) : ""));
  const inputType = field.inputType ?? "number";
  const placeholder = field.placeholder ?? "Enter override";
  const overrideVal = curOverrideName
    ? (form.watch(curOverrideName as any) as any)
    : undefined;
  const computeDefaultVal = React.useCallback(() => {
    if (field.computeDefault)
      return field.computeDefault(form.getValues(), ctx);
    if (field.defaultName) return (form.getValues() as any)[field.defaultName];
    return undefined;
  }, [field, form, ctx]);
  const defaultVal = computeDefaultVal();
  const hasOverride = overrideVal != null && String(overrideVal) !== "";
  const [editing, setEditing] = React.useState<boolean>(
    sticky ? !!hasOverride : false
  );
  React.useEffect(() => {
    if (sticky) setEditing(!!hasOverride);
  }, [sticky, hasOverride]);
  const show = hasOverride ? overrideVal : defaultVal;
  return !editing ? (
    <TextInput
      variant="unstyled"
      readOnly
      {...common}
      value={format(show) as any}
      onClick={() => setEditing(true)}
      rightSection={<IconEditCircle size={16} />}
      styles={{
        input: { paddingLeft: "11px" },
      }}
    />
  ) : (
    <Input.Wrapper {...common}>
      <Indicator color="red" position="middle-start">
        <TextInput
          type={inputType as any}
          placeholder={placeholder}
          rightSection={
            <CloseButton
              size="sm"
              onClick={() => {
                if (curOverrideName)
                  form.setValue(curOverrideName as any, null, {
                    shouldDirty: true,
                  });
                setEditing(false);
              }}
            />
          }
          {...form.register(curOverrideName as any)}
        />
      </Indicator>
    </Input.Wrapper>
  );
}

export function renderField(
  form: UseFormReturn<any>,
  field: FieldConfig,
  mode: FieldMode,
  ctx?: RenderContext
) {
  if (field.hiddenInModes && field.hiddenInModes.includes(mode)) return null;
  if (field.showIf && !field.showIf({ form, mode, field, ctx })) {
    return null;
  }
  if (field.render) return field.render({ form, mode, field, ctx });
  const widget = field.widget || (field.type === "date" ? "date" : "text");
  const common: any = { label: field.label, mod: "data-autosize" };

  const getSelectOptions = () => {
    if (field.options && field.options.length) return field.options;
    if (field.optionsKey && ctx?.fieldOptions?.[field.optionsKey]) {
      return ctx.fieldOptions[field.optionsKey];
    }
    return [] as { value: string; label: string }[];
  };

  switch (widget) {
    case "computed": {
      const values = form.getValues();
      const out = field.compute
        ? field.compute({ form, mode, field, ctx, values })
        : null;
      // Render as read-only text input when scalar; else render a simple block
      if (typeof out === "string" || typeof out === "number" || out == null) {
        return (
          <TextInput
            {...common}
            readOnly
            value={out != null ? String(out) : ""}
          />
        );
      }
      return (
        <div>
          <div style={{ fontSize: 12, marginBottom: 4 }}>{field.label}</div>
          <div>{out}</div>
        </div>
      );
    }
    case "defaultOverride": {
      return (
        <DefaultOverrideRenderer
          form={form}
          field={field}
          mode={mode}
          ctx={ctx}
        />
      );
    }
    case "idStatic": {
      if (mode === "find") {
        return (
          <TextInput
            {...common}
            placeholder={field.findPlaceholder || "equals..."}
            {...form.register(field.name as any)}
          />
        );
      }
      const v =
        form.watch(field.name as any) ??
        (form.getValues() as any)?.[field.name];
      return (
        <TextInput {...common} readOnly value={v != null ? String(v) : ""} />
      );
    }
    case "date": {
      if (mode === "find") {
        return (
          <TextInput
            {...common}
            placeholder={field.findPlaceholder || "yyyy-mm-dd"}
            {...form.register(field.name as any)}
          />
        );
      }
      const val =
        form.watch(field.name as any) ??
        (form.getValues() as any)?.[field.name];
      const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      const dayRenderer = (dateInput: any) => {
        const today = new Date();
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        const valid = d instanceof Date && !isNaN(d.getTime());
        const isToday = valid && isSameDay(d, today);
        const label = valid
          ? d.getDate()
          : typeof dateInput === "number"
          ? dateInput
          : "";
        return (
          <Indicator size={6} color="red" offset={-5} disabled={!isToday}>
            <div>{label}</div>
          </Indicator>
        );
      };
      return (
        <DatePickerInput
          {...common}
          value={val ? new Date(val) : null}
          onChange={(d) => form.setValue(field.name as any, d as any)}
          renderDay={dayRenderer}
        />
      );
    }
    case "select": {
      const opts = getSelectOptions();
      // console.log("Select options:", opts);
      return (
        <Controller
          control={form.control}
          name={field.name as any}
          render={({ field: f }) => {
            const cur = f.value;
            const value = cur == null || cur === "" ? null : String(cur);
            return (
              <Select
                {...common}
                searchable
                clearable
                data={opts}
                placeholder={
                  mode === "find" ? field.findPlaceholder || "any" : undefined
                }
                value={value}
                onChange={(v) => {
                  const shouldBeNumber =
                    typeof cur === "number" || /Id$/.test(field.name);
                  const out = shouldBeNumber
                    ? v != null && v !== ""
                      ? Number(v)
                      : null
                    : v ?? null;
                  f.onChange(out);
                }}
                onBlur={f.onBlur}
                ref={f.ref}
              />
            );
          }}
        />
      );
    }
    case "triBool": {
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
        <Checkbox label={field.label} {...form.register(field.name as any)} />
        // <SegmentedControl
        //   fullWidth
        //   data={[
        //     { label: "Unset", value: "" },
        //     { label: "Yes", value: "true" },
        //     { label: "No", value: "false" },
        //   ]}
        //   value={value ?? ""}
        //   onChange={(v) => form.setValue(field.name as any, v)}
        // />
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
              placeholder="min"
              {...form.register(minField as any)}
              style={{ flex: 1 }}
            />
            <TextInput
              label={field.label + " Max"}
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
          type="number"
          rightSection={
            field.rightSection
              ? field.rightSection({ form, mode, field, ctx })
              : undefined
          }
          value={
            (form.watch(field.name as any) ??
              (form.getValues() as any)?.[field.name] ??
              "") as any
          }
          onChange={(e) => form.setValue(field.name as any, e.target.value)}
        />
      );
    }
    default: {
      return (
        <TextInput
          {...common}
          rightSection={
            field.rightSection
              ? field.rightSection({ form, mode, field, ctx })
              : undefined
          }
          placeholder={
            mode === "find"
              ? field.findPlaceholder ||
                (field.findOp === "equals" ? "equals..." : "contains...")
              : undefined
          }
          {...form.register(field.name as any)}
          readOnly={
            mode === "edit" && (field.editable === false || field.readOnly)
          }
        />
      );
    }
  }
}

// JSX wrapper that pulls options via context and maps to renderField
export function RenderField({
  form,
  field,
  mode,
  ctx,
}: {
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  const options = useOptions();
  const autoCtx: RenderContext | undefined = React.useMemo(() => {
    if (!options && !ctx) return ctx;
    const map = (arr?: { value: string; label: string }[]) => arr || [];
    return {
      ...ctx,
      options: options || ctx?.options,
      fieldOptions: {
        ...(ctx?.fieldOptions || {}),
        category: map(options?.categoryOptions),
        subcategory: map(options?.subcategoryOptions),
        tax: map(options?.taxCodeOptions),
        productType: map(options?.productTypeOptions),
        variantSet: map(options?.variantSetOptions),
        customer: map(options?.customerOptions),
        supplier: map(options?.supplierOptions),
        carrier: map(options?.carrierOptions),
        jobType: map(options?.jobTypeOptions),
        jobStatus: map(options?.jobStatusOptions),
        location: map(options?.locationOptions),
      },
    };
  }, [options, ctx]);

  return renderField(form, field, mode, autoCtx);
}

// JSX to render a group of fields with shared props
export function RenderGroup({
  form,
  fields,
  mode,
  ctx,
  gap = 6,
}: {
  form: UseFormReturn<any>;
  fields: FieldConfig[];
  mode: FieldMode;
  ctx?: RenderContext;
  gap?: number;
}) {
  // Subscribe to all form changes so conditional fields can react to deps
  form.watch();
  const list: FieldConfig[] = Array.isArray(fields) ? fields : [];
  // Filter out fields hidden for this mode to avoid duplicate keys from hidden siblings
  const visible = list.filter(
    (f) => !(f.hiddenInModes && f.hiddenInModes.includes(mode))
  );
  return (
    <Group gap={0} style={{ width: "100%" }}>
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", gap }}>
          {visible.map((field) => {
            const key =
              (field.overrideName as string | undefined) ||
              field.name ||
              field.label;
            return (
              <React.Fragment key={key}>
                <RenderField form={form} field={field} mode={mode} ctx={ctx} />
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </Group>
  );
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
