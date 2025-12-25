import React from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { UseFormReturn } from "react-hook-form";
import type {
  FieldConfig,
  FieldMode,
  RenderContext,
  TrailingActionArgs,
} from "./fieldConfigShared";
import {
  buildOptionPool,
  getSelectOptions,
  resolveOptionLabel,
} from "./fieldOptions";

export function renderTrailingActionWrapper(args: {
  control: React.ReactNode;
  form: UseFormReturn<any>;
  field: FieldConfig;
  mode: FieldMode;
  ctx?: RenderContext;
}) {
  const { control, form, field, mode, ctx } = args;
  if (!field.trailingAction) return control;

  const rawValue =
    form.watch(field.name as any) ?? (form.getValues() as any)?.[field.name];
  const valueStr = rawValue == null || rawValue === "" ? null : String(rawValue);
  const optionPool = buildOptionPool(getSelectOptions(field, ctx));
  const selectedLabel = resolveOptionLabel(valueStr, optionPool);
  const actionArgs: TrailingActionArgs = {
    form,
    mode,
    field,
    ctx,
    value: rawValue,
    label: selectedLabel,
  };
  const actionId = field.trailingAction.getId
    ? field.trailingAction.getId(actionArgs)
    : rawValue;
  const actionDisabled =
    actionId == null ||
    actionId === "" ||
    (field.trailingAction.disabledWhen
      ? field.trailingAction.disabledWhen(actionArgs)
      : false);
  const actionTooltip = field.trailingAction.tooltip
    ? field.trailingAction.tooltip(actionArgs)
    : selectedLabel || (valueStr ?? undefined);
  const openEntityModal = ctx?.openEntityModal;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
      <div style={{ flex: 1, minWidth: 0 }}>{control}</div>
      <div style={{ paddingBottom: 2 }}>
        <Tooltip label={actionTooltip} disabled={!actionTooltip} withArrow>
          <ActionIcon
            variant="subtle"
            size="lg"
            disabled={actionDisabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (actionDisabled || !openEntityModal || actionId == null) return;
              openEntityModal({
                entity: field.trailingAction?.entity || "Entity",
                id: actionId,
              });
            }}
          >
            <IconExternalLink size={16} stroke={1.6} />
          </ActionIcon>
        </Tooltip>
      </div>
    </div>
  );
}
