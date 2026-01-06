import type { ColumnDef } from "~/base/index/columns";
import type { ProductWarning } from "./warnings";

export type ProductFieldSpec = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  formatter?: string;
};

export type ProductSpec = {
  fields: Record<string, ProductFieldSpec>;
  forms: {
    identityFields: unknown;
    assocFields: unknown;
    pricingFields: unknown;
    bomFindFields: unknown;
  };
  find: {
    buildConfig: (...args: any[]) => any;
    deriveSemanticKeys: (...args: any[]) => Set<string>;
  };
  index: {
    columns: ColumnDef[];
    buildColumns: (pricing: any) => ColumnDef[];
    defaultColumns: () => string[];
    defaults: {
      perPage: number;
      sort: string | null;
      dir: string | null;
    };
    presentationKeys: string[];
  };
  warnings: {
    buildProductWarnings: (...args: any[]) => ProductWarning[];
    shouldWarnMissingCmtLine: (
      type: string | null | undefined,
      hasCmtLine: boolean | null | undefined
    ) => boolean;
  };
};

export type { ColumnDef, ProductWarning };
