import type { UseFormReturn } from "react-hook-form";
import type { FieldConfig, FieldMode, RenderContext } from "./fieldConfigShared";

export function resolveFieldState(args: {
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  const { form, field, mode, ctx } = args;
  const dynamicReadOnly = field.readOnlyIf
    ? field.readOnlyIf({ form, mode, field, ctx })
    : false;
  const dynamicReadonlyWhen = field.readonlyWhen
    ? field.readonlyWhen({ form, mode, field, ctx })
    : false;
  const dynamicDisabled = field.disabledWhen
    ? field.disabledWhen({ form, mode, field, ctx })
    : false;
  const resolvedReadOnly =
    dynamicReadOnly ||
    dynamicReadonlyWhen ||
    (mode === "edit" && (field.editable === false || field.readOnly));
  const resolvedDisabled = Boolean(dynamicDisabled);
  return { resolvedReadOnly, resolvedDisabled };
}
