// Lightweight config DSL for FieldConfig.
// Usage:
//   import { f, mod, policy } from "~/base/forms/cfg";
//   const locked = ({ mode, ctx }) => mode === "edit" && ctx?.jobState !== "DRAFT";
//   const fields = [
//     policy.lockWhenNotDraft(locked)(f.text("name", "Name")),
//     mod.hide("edit", "create")(f.select("status", "Status", "jobStatus")),
//   ];
import type { FieldConfig, FieldMode } from "./fieldConfigShared";

type FC = FieldConfig;

export type FieldGroup = {
  key?: string;
  fields: FC[];
  visibleWhen?: FC["visibleWhen"];
};

export type FieldColumn = {
  fields: FC[];
  visibleWhen?: FC["visibleWhen"];
};

export const f = {
  text: (name: string, label: string, extra: Partial<FC> = {}): FC =>
    ({ name, label, widget: "text", findOp: "contains", ...extra } as FC),

  date: (name: string, label: string, extra: Partial<FC> = {}): FC =>
    ({ name, label, widget: "date", findOp: "equals", ...extra } as FC),

  select: (
    name: string,
    label: string,
    optionsKey: string,
    extra: Partial<FC> = {}
  ): FC =>
    ({
      name,
      label,
      widget: "select",
      optionsKey,
      findOp: "contains",
      ...extra,
    } as FC),

  id: (name: string, label: string, extra: Partial<FC> = {}): FC =>
    ({
      name,
      label,
      widget: "idStatic",
      editable: false,
      readOnly: true,
      findOp: "equals",
      ...extra,
    } as FC),

  textarea: (name: string, label: string, extra: Partial<FC> = {}): FC =>
    ({ name, label, widget: "textarea" as any, findOp: "contains", ...extra } as FC),
};

export const mod = {
  hide:
    (...modes: FieldMode[]) =>
    (fc: FC): FC => ({
      ...fc,
      hiddenInModes: modes,
    }),
  ro:
    (pred: FC["readonlyWhen"]) =>
    (fc: FC): FC => ({
      ...fc,
      readonlyWhen: pred,
    }),
  disabled:
    (pred: FC["disabledWhen"]) =>
    (fc: FC): FC => ({
      ...fc,
      disabledWhen: pred,
    }),
  show:
    (pred: FC["showIf"]) =>
    (fc: FC): FC => ({
      ...fc,
      showIf: pred,
    }),
  visible:
    (pred: FC["visibleWhen"]) =>
    (fc: FC): FC => ({
      ...fc,
      visibleWhen: pred,
    }),
  inline:
    (flex = 1) =>
    (fc: FC): FC => ({
      ...fc,
      inlineWithNext: true,
      flex,
    }),
};

export const policy = {
  lockWhenNotDraft:
    (locked: FC["readonlyWhen"]) =>
    (fc: FC): FC => ({
      ...fc,
      readonlyWhen: locked,
    }),
  draftOnly:
    (pred: FC["visibleWhen"]) =>
    (fc: FC): FC => ({
      ...fc,
      visibleWhen: pred,
    }),
};

export const g = {
  group: (key: string, fields: FC[], extra: Partial<FieldGroup> = {}): FieldGroup => ({
    key,
    fields,
    ...extra,
  }),
  columns: (...cols: FieldColumn[]) => cols,
};
