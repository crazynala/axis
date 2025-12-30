import React from "react";
import { Input, Text, Tooltip } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";

type DisplayFieldProps = {
  label: string;
  value: React.ReactNode;
  help?: string | React.ReactNode;
  mod?: string;
  emptyDisplay?: string;
  common?: any;
};

function resolveEmptyValue(value: React.ReactNode, emptyDisplay: string) {
  if (value == null) return emptyDisplay;
  if (typeof value === "string" && value.trim() === "") return emptyDisplay;
  return value;
}

export function DisplayField({
  label,
  value,
  help,
  mod = "data-autosize",
  emptyDisplay = "—",
  common,
}: DisplayFieldProps) {
  const displayValue = resolveEmptyValue(value, emptyDisplay);
  const shared = common ?? {};
  const labelNode = help ? (
    <span style={{ position: "relative", display: "inline-block" }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Tooltip label={help} withArrow>
        <span
          style={{
            position: "absolute",
            left: "-4px",
            top: "50%",
            transform: "translate(-100%, -50%)",
          }}
        >
          <IconInfoCircle size={14} />
        </span>
      </Tooltip>
    </span>
  ) : (
    label
  );

  return (
    <Input.Wrapper label={labelNode} mod={mod} {...shared}>
      <Text size="sm">{displayValue}</Text>
    </Input.Wrapper>
  );
}
