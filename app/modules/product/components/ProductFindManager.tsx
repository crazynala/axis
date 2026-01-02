import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useFind } from "~/base/find/FindContext";
import { ProductFindModal } from "../components/ProductFindModal";
import type { ProductAttributeDefinition } from "~/modules/productMetadata/types/productMetadata";
import { allProductFindFields } from "../forms/productDetail";
import { buildProductMetadataFields } from "~/modules/productMetadata/utils/productMetadataFields";
import { deriveSemanticKeys } from "~/base/index/indexController";

// Simple Product Find Modal leveraging existing URL param filtering (products loader reads params)
export function ProductFindManager({
  metadataDefinitions = [],
}: {
  metadataDefinitions?: ProductAttributeDefinition[];
}) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);
  const filterableDefs = useMemo(
    () => metadataDefinitions.filter((def) => def.isFilterable),
    [metadataDefinitions]
  );
  const semanticKeys = useMemo(() => {
    const metaFields = buildProductMetadataFields(filterableDefs, {
      onlyFilterable: true,
    });
    return new Set(deriveSemanticKeys(allProductFindFields(metaFields)));
  }, [filterableDefs]);

  // Legacy auto-open removed: modal opens only via registered hotkey/callback.

  useEffect(
    () => registerFindCallback(() => setOpen(true)),
    [registerFindCallback]
  );

  return (
    <ProductFindModal
      opened={open}
      onClose={() => {
        setOpen(false);
      }}
      onSearch={(qs) => {
        const url = new URL(window.location.href);
        const produced = new URLSearchParams(qs);
        const viewName = url.searchParams.get("view");
        Array.from(url.searchParams.keys()).forEach((k) => {
          if (k === "q" || k === "findReqs" || semanticKeys.has(k))
            url.searchParams.delete(k);
        });
        for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
        url.searchParams.delete("page");
        url.searchParams.delete("findMode");
        if (viewName) {
          url.searchParams.delete("view");
          url.searchParams.set("lastView", viewName);
        }
        setOpen(false);
        navigate(url.pathname + "?" + url.searchParams.toString());
      }}
      initialValues={(() => {
        const base = Object.fromEntries(
          Array.from(sp.entries()).filter(([k]) => k !== "find")
        ) as Record<string, any>;
        // If legacy global 'q' is present and 'name' is not, treat it as a Name contains for prefilling the modal
        if (base.q && !base.name) {
          base.name = base.q;
          delete base.q;
        }
        return base as any;
      })()}
      metadataDefinitions={filterableDefs}
    />
  );
}
