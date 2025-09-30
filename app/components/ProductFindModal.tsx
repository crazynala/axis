import React from "react";
import { ProductDetailForm } from "../modules/product/components/ProductDetailForm";
import type { ProductFindValues } from "~/modules/product/findify/product.search-schema";
import { allProductFindFields } from "../modules/product/forms/productDetail";
import { GenericMultiFindModal } from "./find/GenericMultiFindModal";

export interface ProductFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void; // query string (no leading ?)
  initialValues?: Partial<ProductFindValues>;
}

function buildDefaults(): ProductFindValues {
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
  };
}

export function ProductFindModal(props: ProductFindModalProps) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults,
        allFields: allProductFindFields,
        title: "Find Products",
      }}
      FormComponent={ProductDetailForm as any}
    />
  );
}
