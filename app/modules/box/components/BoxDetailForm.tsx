import type React from "react";
import type { UseFormReturn } from "react-hook-form";
import { LayoutFormRenderer } from "~/base/forms/LayoutFormRenderer";
import { boxDetailPage } from "~/modules/box/spec/detail";

export type BoxDetailFormProps = {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  fieldCtx?: Record<string, any>;
  onSave?: (values: any) => void;
  children?: React.ReactNode;
};

export function BoxDetailForm({
  mode,
  form,
  fieldCtx,
  onSave,
  children,
}: BoxDetailFormProps) {
  return (
    <LayoutFormRenderer
      page={boxDetailPage}
      form={form}
      mode={mode as any}
      ctx={fieldCtx}
      onSave={onSave}
    >
      {children}
    </LayoutFormRenderer>
  );
}
