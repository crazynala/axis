import type { FieldConfig, RenderContext } from "./fieldConfigShared";

export function buildCommonInputProps(field: FieldConfig, ctx?: RenderContext) {
  const common: any = { label: field.label, mod: "data-autosize" };
  const requiredState = (ctx as any)?.requiredStates?.[field.name];
  if (requiredState?.state === "error") {
    common.error = requiredState.message ?? "Required";
  } else if (requiredState?.state === "warn") {
    common.description = requiredState.message ?? "Required";
    common.styles = {
      input: {
        borderColor: "var(--mantine-color-yellow-6)",
      },
    };
  }
  return common;
}
