import { Group, Select, TextInput, Button } from "@mantine/core";
import { Form, useSearchParams, useNavigate } from "@remix-run/react";
import React from "react";

interface SavedViewsProps {
  views: any[];
  activeView: string | null;
}

export function SavedViews({ views, activeView }: SavedViewsProps) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  return (
    <Group align="center" mb="sm" gap="xs">
      <Select
        placeholder="Saved views"
        data={(views || []).map((v: any) => ({ value: v.name, label: v.name }))}
        defaultValue={activeView || null}
        onChange={(val) => {
          const next = new URLSearchParams(sp);
          if (val) next.set("view", val);
          else next.delete("view");
          next.set("page", "1");
          navigate(`?${next.toString()}`);
        }}
        w={220}
        clearable
      />
      <Form method="post">
        <input type="hidden" name="_intent" value="saveView" />
        <Group gap="xs" align="center">
          <TextInput
            name="name"
            placeholder="Save current filters as…"
            w={220}
          />
          <Button type="submit">Save view</Button>
        </Group>
      </Form>
    </Group>
  );
}
