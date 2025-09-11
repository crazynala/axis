import { useSearchParams, useNavigate } from "@remix-run/react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";
import { ShipmentFindModal } from "./ShipmentFindModal";

export function ShipmentFindManager() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const opened = sp.get("findMode") === "1";
  const open = () => {
    const next = new URLSearchParams(sp);
    next.set("findMode", "1");
    navigate(`?${next.toString()}`);
  };
  const close = () => {
    const next = new URLSearchParams(sp);
    next.delete("findMode");
    navigate(`?${next.toString()}`);
  };
  const onSearch = (qs: string) => {
    // Merge produced query string
    const url = new URL(window.location.href);
    const produced = new URLSearchParams(qs);
    // Drop existing find params
    Array.from(url.searchParams.keys()).forEach((k) => {
      if (k === "findReqs" || produced.has(k)) url.searchParams.delete(k);
    });
    for (const [k, v] of produced.entries()) url.searchParams.set(k, v);
    url.searchParams.delete("findMode");
    navigate(url.pathname + "?" + url.searchParams.toString());
  };
  return (
    <>
      <Tooltip label="Find Shipments" position="right">
        <ActionIcon
          onClick={open}
          variant={opened ? "filled" : "light"}
          color="blue"
          size="lg"
          style={{ position: "fixed", bottom: 16, left: 16, zIndex: 200 }}
        >
          <IconSearch size={18} />
        </ActionIcon>
      </Tooltip>
      <ShipmentFindModal opened={opened} onClose={close} onSearch={onSearch} />
    </>
  );
}
