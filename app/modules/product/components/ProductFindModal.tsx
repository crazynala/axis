import React from "react";
import { Button } from "@mantine/core";
import { ProductDetailForm } from "./ProductDetailForm";
import type { ProductFindValues } from "../findify/product.search-schema";
import { productSpec } from "../spec";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { buildProductMetadataDefaults, buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { GenericMultiFindModal } from "../../../components/find/GenericMultiFindModal";
import type { MultiFindState } from "~/base/find/multiFind";
import { getGlobalOptions } from "~/base/options/OptionsClient";

export interface ProductFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void; // query string (no leading ?)
  initialValues?: Partial<ProductFindValues>;
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  metadataDefinitions?: ProductAttributeDefinition[];
  restoreQs?: string | null;
  onRestore?: (qs: string) => void;
}

function buildDefaults(
  metadataDefinitions: ProductAttributeDefinition[] = []
): ProductFindValues {
  return {
    sku: "",
    name: "",
    description: "",
    type: "",
    costPriceMin: undefined,
    costPriceMax: undefined,
    manualSalePriceMin: undefined,
    manualSalePriceMax: undefined,
    purchaseTaxId: undefined,
    categoryId: undefined,
    customerId: undefined,
    supplierId: undefined,
    stockTrackingEnabled: "any" as any,
    batchTrackingEnabled: "any" as any,
    componentChildSku: "",
    componentChildName: "",
    componentChildSupplierId: undefined,
    componentChildType: "",
    ...(buildProductMetadataDefaults(metadataDefinitions, null, { forFind: true }) as any),
  };
}

export function ProductFindModal(props: ProductFindModalProps) {
  const globalOptions = getGlobalOptions();
  const metadataFields = buildProductMetadataFields(
    props.metadataDefinitions || [],
    {
      onlyFilterable: true,
      enumOptionsByDefinitionId:
        globalOptions?.productAttributeOptionsByDefinitionId || {},
    }
  );
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      initialMode={props.initialMode}
      initialMulti={props.initialMulti}
      headerActions={
        props.onRestore ? (
          <Button
            size="xs"
            variant="subtle"
            disabled={!props.restoreQs}
            onClick={() => {
              if (!props.restoreQs) return;
              props.onRestore?.(props.restoreQs);
            }}
            type="button"
          >
            Restore
          </Button>
        ) : null
      }
      adapter={{
        buildDefaults: () => buildDefaults(props.metadataDefinitions || []),
        allFields: () => productSpec.find.buildConfig(metadataFields),
        title: "Find Products",
      }}
      FormComponent={ProductDetailForm as any}
    />
  );
}
