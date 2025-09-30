import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useFind } from "../../../base/find/FindContext";
import { ProductFindModal } from "../../../components/ProductFindModal";

// Simple Product Find Modal leveraging existing URL param filtering (products loader reads params)
export function ProductFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);

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
        setOpen(false);
        navigate(`/products?${qs}`);
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
    />
  );
}
