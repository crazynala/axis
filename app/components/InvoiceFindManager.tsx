import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { InvoiceFindModal } from "./InvoiceFindModal";
import { useFind } from "../find/FindContext";

export function InvoiceFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);

  useEffect(() => registerFindCallback(() => setOpen(true)), [registerFindCallback]);

  const onSearch = (qs: string) => {
    setOpen(false);
    navigate(`/invoices?${qs}`);
  };
  return <InvoiceFindModal opened={open} onClose={() => setOpen(false)} onSearch={onSearch} />;
}
