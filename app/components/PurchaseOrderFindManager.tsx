import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { PurchaseOrderFindModal } from "./PurchaseOrderFindModal";
import { useFind } from "../find/FindContext";

export function PurchaseOrderFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);
  useEffect(() => registerFindCallback(() => setOpen(true)), [registerFindCallback]);
  const onSearch = (qs: string) => {
    setOpen(false);
    navigate(`/purchase-orders?${qs}`);
  };
  return <PurchaseOrderFindModal opened={open} onClose={() => setOpen(false)} onSearch={onSearch} />;
}
