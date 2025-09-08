import { Anchor, Group, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import type { ReactNode } from "react";

export function ExternalLink({
  href,
  children,
  target = "_blank",
  rel = "noreferrer noopener",
  size = 12,
}: {
  href: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  size?: number;
}) {
  return (
    <Anchor href={href} target={target} rel={rel} underline="always">
      <Group gap={4} wrap="nowrap" align="center">
        <Text inherit>{children}</Text>
        <IconExternalLink size={size} stroke={1.8} />
      </Group>
    </Anchor>
  );
}
