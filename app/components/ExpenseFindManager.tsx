import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "@remix-run/react";
import { ExpenseFindModal } from "./ExpenseFindModal";
import { useFind } from "../find/FindContext";

export function ExpenseFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [opened, setOpened] = useState(false);

  useEffect(
    () => registerFindCallback(() => setOpened(true)),
    [registerFindCallback]
  );

  const close = () => {
    setOpened(false);
    const next = new URLSearchParams(sp);
    next.delete("findMode");
    navigate(`?${next.toString()}`);
  };

  const onSearch = (qs: string) => {
    setOpened(false);
    navigate(`/expenses?${qs}`);
  };
  return (
    <ExpenseFindModal
      opened={opened}
      onClose={() => setOpened(false)}
      onSearch={onSearch}
    />
  );
}
