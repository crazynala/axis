import type React from "react";
import type { UseFormReturn } from "react-hook-form";
import { LayoutFormRenderer } from "~/base/forms/LayoutFormRenderer";
import { purchaseOrderDetailPage } from "~/modules/purchaseOrder/spec/purchaseOrderDetailPage";

export interface PurchaseOrderDetailFormProps {
  mode: "edit" | "find" | "create";
  form: UseFormReturn<any>;
  purchaseOrder?: any;
  customerOptions?: { value: string; label: string }[];
  fieldCtx?: Record<string, any>;
  onSave?: (values: any) => void;
  children?: React.ReactNode;
}

export function PurchaseOrderDetailForm({
  mode,
  form,
  fieldCtx,
  onSave,
  children,
}: PurchaseOrderDetailFormProps) {
  return (
    <LayoutFormRenderer
      page={purchaseOrderDetailPage}
      form={form}
      mode={mode as any}
      ctx={fieldCtx}
      onSave={onSave}
    >
      {children}
    </LayoutFormRenderer>
  );
}
