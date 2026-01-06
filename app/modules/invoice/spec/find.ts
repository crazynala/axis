import { deriveSemanticKeys } from "~/base/index/indexController";
import { allInvoiceFindFields } from "../forms/invoiceDetail";

export const buildInvoiceFindConfig = () => allInvoiceFindFields();

export const deriveInvoiceSemanticKeys = () =>
  new Set(deriveSemanticKeys(buildInvoiceFindConfig()));

export const invoiceFind = {
  buildConfig: buildInvoiceFindConfig,
  deriveSemanticKeys: deriveInvoiceSemanticKeys,
};
