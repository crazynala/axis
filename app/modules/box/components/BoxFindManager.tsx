import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "@remix-run/react";
import { useFind } from "~/base/find/FindContext";
import { BoxFindModal } from "./BoxFindModal";

export function BoxFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { registerFindCallback } = useFind();
  const [opened, setOpened] = useState(false);

  useEffect(
    () => registerFindCallback(() => setOpened(true)),
    [registerFindCallback]
  );

  const initialValues = useMemo(() => {
    const entries = Array.from(sp.entries()).filter(([key]) => key !== "find");
    return Object.fromEntries(entries);
  }, [sp]);

  return (
    <BoxFindModal
      opened={opened}
      onClose={() => setOpened(false)}
      initialValues={initialValues as any}
      onSearch={(qs) => {
        setOpened(false);
        navigate(`/boxes?${qs}`);
      }}
    />
  );
}
