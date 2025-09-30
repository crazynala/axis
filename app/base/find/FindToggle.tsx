// app/find/FindToggle.tsx
import { Button, Group } from "@mantine/core";
import { useFind } from "./FindContext";

type FindToggleProps = {
  onSearch?: () => void;
  beforeEnterFind?: () => boolean | Promise<boolean>;
};

export function FindToggle(props: FindToggleProps) {
  const { mode, setMode } = useFind();
  async function handleToggle() {
    if (mode === "edit") {
      if (props.beforeEnterFind) {
        const ok = await props.beforeEnterFind();
        if (!ok) return;
      }
      setMode("find");
    } else {
      setMode("edit");
    }
  }
  return (
    <Group gap="xs">
      <Button
        variant={mode === "find" ? "filled" : "light"}
        onClick={handleToggle}
      >
        {mode === "find" ? "Exit Find" : "Find"}
      </Button>
      {mode === "find" && (
        <Button variant="light" onClick={props.onSearch}>
          Search
        </Button>
      )}
    </Group>
  );
}
