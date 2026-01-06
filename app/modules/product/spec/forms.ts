import {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
  productBomFindFields,
  allProductFindFields,
} from "../forms/productDetail";

export const productForms = {
  identityFields: productIdentityFields,
  assocFields: productAssocFields,
  pricingFields: productPricingFields,
  bomFindFields: productBomFindFields,
  allFindFields: allProductFindFields,
};

// TODO: centralize edit/new/detail layouts into spec once form configs are split out.

export {
  productIdentityFields,
  productAssocFields,
  productPricingFields,
  productBomFindFields,
  allProductFindFields,
};
