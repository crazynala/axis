// Small helper to normalize product create/update payloads from a FormData

export function buildProductData(form: FormData) {
  const data: any = {};
  const str = (k: string) => {
    if (form.has(k)) data[k] = (form.get(k) as string)?.trim() || null;
  };
  const num = (k: string) => {
    if (form.has(k)) {
      const v = form.get(k) as string;
      data[k] = v === "" || v == null ? null : Number(v);
    }
  };
  const bool = (k: string) => {
    if (form.has(k)) {
      const v = String(form.get(k));
      data[k] = v === "true" || v === "on";
    }
  };
  // strings
  str("sku");
  str("name");
  str("description");
  str("type");
  // numerics
  num("costPrice");
  num("manualSalePrice");
  num("purchaseTaxId");
  num("categoryId");
  num("customerId");
  num("supplierId");
  // booleans
  bool("stockTrackingEnabled");
  bool("batchTrackingEnabled");
  return data;
}
