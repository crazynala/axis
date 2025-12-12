import { useMantineTheme } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { Link } from "@remix-run/react";
import { useState, type ComponentProps } from "react";

type JumpLinkProps = {
  to: string;
  label: React.ReactNode;
  target?: ComponentProps<typeof Link>["target"];
  rel?: string;
} & Omit<
  React.ComponentProps<typeof Link>,
  "to" | "children" | "target" | "rel"
>;

// Reusable link-with-icon for navigating to related entities with consistent hover styling.
export function JumpLink({
  to,
  label,
  target,
  rel,
  style,
  ...anchorProps
}: JumpLinkProps) {
  const theme = useMantineTheme();
  const [hover, setHover] = useState(false);
  const hoverColor =
    (theme.colors[theme.primaryColor]?.[6] as string | undefined) ||
    "var(--mantine-color-anchor)";

  return (
    <Link
      to={to}
      target={target}
      rel={rel}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        color: hover ? hoverColor : "inherit",
        textDecoration: "none",
        ...style,
      }}
      {...anchorProps}
    >
      <span style={{ textDecoration: "none" }}>{label}</span>
      <IconExternalLink size={14} />
    </Link>
  );
}
