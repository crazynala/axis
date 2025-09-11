import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ExpenseFindModal } from "./ExpenseFindModal";
import { useFind } from "../find/FindContext";

export function ExpenseFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);
  useEffect(
    () => registerFindCallback(() => setOpen(true)),
    [registerFindCallback]
  );
  const onSearch = (qs: string) => {
    setOpen(false);
    navigate(`/expenses?${qs}`);
  };
  return (
    <ExpenseFindModal
      opened={open}
      onClose={() => setOpen(false)}
      onSearch={onSearch}
    />
  );
}
