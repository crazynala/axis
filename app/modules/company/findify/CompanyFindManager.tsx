import { useEffect, useState } from "react";
import { Modal, TextInput, Button, Group, Stack } from "@mantine/core";
import { useFind } from "~/base/find/FindContext";
import { useLocation, useNavigate } from "@remix-run/react";

// Simple Company Find Manager: filters by name substring and flags (customer/supplier/carrier)
export function CompanyFindManager() {
  const { registerFindCallback } = useFind();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const url = new URL(location.pathname + location.search, "http://dummy");
  const initial = {
    name: url.searchParams.get("name") || "",
  };
  const [name, setName] = useState(initial.name);

  useEffect(() => {
    return registerFindCallback(() => setOpen(true));
  }, [registerFindCallback]);

  // Sync ?find=1 opening (optional legacy compatibility)
  useEffect(() => {
    const u = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    if (u.searchParams.get("find") === "1" && !open) setOpen(true);
  }, [location, open]);

  const apply = () => {
    const u = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    if (name) u.searchParams.set("name", name);
    else u.searchParams.delete("name");
    u.searchParams.delete("page"); // reset pagination if any
    navigate(u.pathname + "?" + u.searchParams.toString());
    setOpen(false);
  };
  const clear = () => {
    const u = new URL(
      location.pathname + location.search,
      window.location.origin
    );
    ["name"].forEach((k) => u.searchParams.delete(k));
    u.searchParams.delete("page");
    navigate(u.pathname + "?" + u.searchParams.toString());
    setName("");
    setOpen(false);
  };

  if (!open) return null;
  return (
    <Modal
      opened={open}
      onClose={() => setOpen(false)}
      title="Find Companies"
      size="sm"
    >
      <Stack gap="sm">
        <TextInput
          label="Name contains"
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          autoFocus
        />
        <Group justify="space-between" mt="sm">
          <Button variant="default" onClick={clear}>
            Clear
          </Button>
          <Group>
            <Button variant="default" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={apply}>Apply</Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
