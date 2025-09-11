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

  const [opened, setOpened] = useState(false);

  useEffect(
    () => registerFindCallback(() => setOpened(true)),
    [registerFindCallback]
  );
  const open = () => setOpened(true);
  const close = () => {
    setOpened(false);
    const next = new URLSearchParams(sp);
    next.delete("findMode");
    navigate(`?${next.toString()}`);
  };
  const onSearch = (qs: string) => {
    const url = new URL(window.location.href);
    const produced = new URLSearchParams(qs);
    Array.from(url.searchParams.keys()).forEach((k) => {
      if (k === "findReqs" || produced.has(k)) url.searchParams.delete(k);
    });
    for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
    url.searchParams.delete("findMode");
    setOpened(false);
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <PurchaseOrderFindModal
      opened={open}
      onClose={() => setOpen(false)}
      onSearch={onSearch}
    />
  );
}
