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
  Combobox,
  useCombobox,
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
  allOptionsKey?: string; // optional fallback pool to use when no options are found in optionsKey (or when filtered list is empty)
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
    // Always return an object with primary/fallback arrays
    if (field.options && field.options.length) {
      return {
        primary: field.options,
        fallback: [] as { value: string; label: string }[],
      };
    }
    const primary =
      field.optionsKey && ctx?.fieldOptions?.[field.optionsKey]
        ? ctx.fieldOptions[field.optionsKey]
        : [];
    const fallback =
      field.allOptionsKey && ctx?.fieldOptions?.[field.allOptionsKey]
        ? ctx.fieldOptions[field.allOptionsKey]
        : [];
    return { primary, fallback } as {
      primary: { value: string; label: string }[];
      fallback: { value: string; label: string }[];
    };
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
      // Use Controller to wire value/onChange so RHF can track dirty/touched reliably
      return (
        <Controller
          control={form.control}
          name={field.name as any}
          render={({ field: f }) => {
            const v: any = f.value;
            const value: Date | null = v
              ? v instanceof Date
                ? v
                : new Date(v)
              : null;
            return (
              <DatePickerInput
                {...common}
                value={value}
                onChange={(d) => {
                  // Forward as-is; RHF will compute dirty vs defaultValue
                  f.onChange(d as any);
                }}
                onBlur={f.onBlur}
                ref={f.ref as any}
                clearable
                renderDay={dayRenderer}
              />
            );
          }}
        />
      );
    }
    case "select": {
      const { primary, fallback } = getSelectOptions() as any;
      return (
        <Controller
          control={form.control}
          name={field.name as any}
          render={({ field: f }) => {
            const unaccentText = (s: string) =>
              (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const cur = f.value;
            const coerceToNumber =
              typeof cur === "number" || /Id$/.test(field.name);
            const valueStr = cur == null || cur === "" ? null : String(cur);
            const allForLookup = React.useMemo(
              () => [...(primary || []), ...(fallback || [])],
              [primary, fallback]
            );
            const selectedLabel = React.useMemo(() => {
              if (valueStr == null) return "";
              const hit = allForLookup.find((o) => o.value === valueStr);
              return hit?.label || valueStr;
            }, [valueStr, allForLookup]);

            const combobox = useCombobox({
              onDropdownClose: () => combobox.resetSelectedOption(),
            });
            const [search, setSearch] = React.useState<string>("");

            const baseList =
              primary && primary.length ? primary : fallback || [];

            const filter = (list: { value: string; label: string }[]) => {
              if (!search) return list;
              const q = unaccentText(search).toLowerCase();
              return list.filter((o) =>
                unaccentText(String(o.label || ""))
                  .toLowerCase()
                  .includes(q)
              );
            };
            const filteredPrimary = filter(primary || []);
            const filteredFallback = filter(fallback || []);
            const visible =
              primary && primary.length && filteredPrimary.length > 0
                ? filteredPrimary
                : filteredFallback.length > 0
                ? filteredFallback
                : filter(baseList);

            const setFormValue = (v: string | null) => {
              const out = coerceToNumber
                ? v != null && v !== ""
                  ? Number(v)
                  : null
                : v ?? null;
              f.onChange(out);
            };

            return (
              <Combobox
                store={combobox}
                withinPortal
                onOptionSubmit={(val) => {
                  if (val === "__EMPTY__") {
                    setFormValue(mode === "find" ? "" : null);
                    setSearch("");
                  } else {
                    setFormValue(val);
                    const picked = allForLookup.find((o) => o.value === val);
                    setSearch(picked?.label || "");
                  }
                  combobox.closeDropdown();
                }}
              >
                <Combobox.Target>
                  <TextInput
                    {...common}
                    value={combobox.dropdownOpened ? search : selectedLabel}
                    onFocus={(event) => {
                      setSearch(selectedLabel);
                      combobox.openDropdown();
                      event.currentTarget.select();
                    }}
                    onChange={(event) => {
                      setSearch(event.currentTarget.value);
                      combobox.openDropdown();
                      combobox.updateSelectedOptionIndex();
                    }}
                    onBlur={(e) => {
                      f.onBlur();
                    }}
                    rightSection={
                      valueStr != null ||
                      (mode === "find" && (f.value ?? "") !== "") ? (
                        <CloseButton
                          size="sm"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setFormValue(mode === "find" ? "" : null);
                            setSearch("");
                          }}
                        />
                      ) : undefined
                    }
                    placeholder={
                      mode === "find"
                        ? field.findPlaceholder || "any"
                        : undefined
                    }
                    ref={f.ref as any}
                  />
                </Combobox.Target>
                <Combobox.Dropdown>
                  <div
                    style={{
                      maxHeight: 260,
                      overflowY: "auto",
                      overscrollBehavior: "contain",
                    }}
                    onWheel={(e) => {
                      // prevent page scroll while interacting with dropdown
                      e.stopPropagation();
                    }}
                  >
                    <Combobox.Options>
                      {mode === "find" && (
                        <Combobox.Option value="__EMPTY__">
                          (Any)
                        </Combobox.Option>
                      )}
                      {visible.map((o) => (
                        <Combobox.Option key={o.value} value={o.value}>
                          {o.label}
                        </Combobox.Option>
                      ))}
                      {visible.length === 0 && (
                        <Combobox.Empty>Nothing found</Combobox.Empty>
                      )}
                    </Combobox.Options>
                  </div>
                </Combobox.Dropdown>
              </Combobox>
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
        customerAll: map(options?.customerAllOptions),
        supplier: map(options?.supplierOptions),
        supplierAll: map(options?.supplierAllOptions),
        companyAll: map(options?.companyAllOptions),
        carrier: map(options?.carrierOptions),
        jobType: map(options?.jobTypeOptions),
        jobStatus: map(options?.jobStatusOptions),
        location: map(options?.locationOptions),
        salePriceGroup: map(options?.salePriceGroupOptions),
        costGroup: map(options?.costGroupOptions),
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
