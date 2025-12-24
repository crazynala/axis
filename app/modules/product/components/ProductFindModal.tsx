import React from "react";
import { ProductDetailForm } from "./ProductDetailForm";
import type { ProductFindValues } from "../findify/product.search-schema";
import { allProductFindFields } from "../forms/productDetail";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { buildProductMetadataDefaults, buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { GenericMultiFindModal } from "../../../components/find/GenericMultiFindModal";

export interface ProductFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void; // query string (no leading ?)
  initialValues?: Partial<ProductFindValues>;
  metadataDefinitions?: ProductAttributeDefinition[];
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
  const metadataFields = buildProductMetadataFields(
    props.metadataDefinitions || [],
    { onlyFilterable: true }
  );
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: () => buildDefaults(props.metadataDefinitions || []),
        allFields: () => allProductFindFields(metadataFields),
        title: "Find Products",
      }}
      FormComponent={ProductDetailForm as any}
    />
  );
}
