// app/find/FindToggle.tsx
import { Button, Group } from "@mantine/core";
import { useFind } from "./FindContext";

export function FindToggle({ onSearch }: { onSearch: () => void }) {
  const { mode, setMode } = useFind();
  return (
    <Group gap="xs">
      <Button
        variant={mode === "find" ? "filled" : "light"}
        onClick={() => setMode(mode === "find" ? "edit" : "find")}
      >
        {mode === "find" ? "Exit Find" : "Find"}
      </Button>
      {mode === "find" && (
        <Button variant="light" onClick={onSearch}>
          Search
        </Button>
      )}
    </Group>
  );
}
