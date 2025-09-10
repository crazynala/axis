import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { useFind } from "../find/FindContext";
import { ProductFindModal } from "./ProductFindModal";

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
      initialValues={
        Object.fromEntries(
          Array.from(sp.entries()).filter(([k]) => k !== "find")
        ) as any
      }
    />
  );
}
