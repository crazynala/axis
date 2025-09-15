import type { MultiFindState } from "../../find/multiFind";

export type FindFieldConfig = {
  name: string;
  widget?: string;
  // In find modals we reuse FieldConfig which allows optional min/max; keep this compatible
  rangeFields?: { min?: string; max?: string };
  findOp?: any; // presence indicates included in find criteria
};

export interface GenericFindModalProps<TValues> {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void;
  initialValues?: Partial<TValues>;
}

export interface MultiRequestAdapter<TValues> {
  buildDefaults: () => TValues;
  allFields: () => FindFieldConfig[];
  title: string;
}

export interface EncodeMultiFn {
  (state: MultiFindState): string;
}
