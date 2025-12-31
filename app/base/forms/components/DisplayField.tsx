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
            left: "-10px",
            top: "50%",
            transform: "translateY(-50%)",
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
      {typeof displayValue === "string" || typeof displayValue === "number" ? (
        <Text size="sm">{displayValue}</Text>
      ) : (
        displayValue
      )}
    </Input.Wrapper>
  );
}
