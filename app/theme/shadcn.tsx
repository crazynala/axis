import React from "react";
import {
  MantineProvider,
  createTheme,
  rem,
  Button,
  Input,
  Card,
  Tabs,
} from "@mantine/core";

// Tailwind-ish zinc palette (10 shades)
const zinc = [
  "#fafafa", // 50
  "#f4f4f5", // 100
  "#e4e4e7", // 200
  "#d4d4d8", // 300
  "#a1a1aa", // 400
  "#71717a", // 500
  "#52525b", // 600
  "#3f3f46", // 700
  "#27272a", // 800
  "#18181b", // 900
] as const;

// Violet primary (swap for your brand palette anytime)
const violet = [
  "#f5f3ff",
  "#ede9fe",
  "#ddd6fe",
  "#c4b5fd",
  "#a78bfa",
  "#8b5cf6",
  "#7c3aed",
  "#6d28d9",
  "#5b21b6",
  "#4c1d95",
] as const;

// Global CSS tokens to emulate shadcn’s feel
const rootCss = `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --border: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
}
.dark, [data-mantine-color-scheme="dark"] {
  --background: 224 71% 4%;
  --foreground: 213 31% 91%;
  --muted: 223 47% 11%;
  --muted-foreground: 215 20.2% 65.1%;
  --border: 216 34% 17%;
  --ring: 222.2 84% 4.9%;
}
`;

export const shadcnTheme = createTheme({
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji"',
  headings: { fontWeight: "600" },
  defaultRadius: "md",
  radius: { xs: rem(2), sm: rem(4), md: rem(6), lg: rem(8), xl: rem(12) },
  shadows: {
    xs: "0 1px 1px rgba(0,0,0,0.04)",
    sm: "0 1px 2px rgba(0,0,0,0.05)",
    md: "0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)",
  },
  primaryColor: "zinc",
  colors: {
    // neutral
    zinc,
    // keep Mantine defaults for others (including red)
  },
  components: {
    // ---- Button = shadcn-like presets ----
    Button: Button.extend({
      defaultProps: { radius: "md", size: "md" },
      styles: (theme, params) => {
        const fallback = theme.primaryColor as keyof typeof theme.colors;
        const colorKey = (params.color ??
          fallback) as keyof typeof theme.colors;
        const c = theme.colors[colorKey] ?? theme.colors[fallback];
        const z = theme.colors.zinc ?? (zinc as unknown as string[]);
        const isFilled = params.variant === "filled";
        const isOutline = params.variant === "outline";
        const isLight = params.variant === "light";
        const isTransparent = params.variant === "transparent";
        return {
          root: {
            fontWeight: 500,
            borderWidth: "1px",
            borderStyle: "solid",
            borderColor: "transparent",
            boxShadow: "none",
            transition: "background-color .15s, border-color .15s, color .15s",
            "&:focusVisible": {
              outline: "2px solid hsl(var(--ring))",
              outlineOffset: "2px",
            },
            ...(isFilled && {
              backgroundColor: c[6],
              color: "#fff",
              borderColor: "transparent",
              "&:hover": { backgroundColor: c[7] },
            }),
            ...(isOutline && {
              backgroundColor: "transparent",
              borderColor: "hsl(var(--border))",
              color: (z?.[7] as string) ?? "#3f3f46",
              "&:hover": { backgroundColor: "hsl(var(--muted))" },
            }),
            ...(isLight && {
              backgroundColor: "transparent",
              color: (z?.[7] as string) ?? "#3f3f46",
              "&:hover": { backgroundColor: "hsl(var(--muted))" },
            }),
            ...(isTransparent && {
              background: "none",
              borderColor: "transparent",
              color: c[6],
              paddingLeft: 0,
              paddingRight: 0,
              height: "auto",
              textDecoration: "underline",
              boxShadow: "none",
              "&:hover": { color: c[7] },
            }),
          },
        };
      },
    }),

    // ---- Inputs = subtle borders + focus ring ----
    Input: Input.extend({
      defaultProps: { radius: "md", size: "md" },
      styles: (theme) => ({
        wrapper: {},
        input: {
          borderColor: "hsl(var(--border))",
          backgroundColor: "white",
          color: "hsl(var(--foreground))",
          "&:hover": { borderColor: theme.colors.zinc[3] },
          "&:focus": {
            outline: "2px solid hsl(var(--ring))",
            outlineOffset: "2px",
          },
          "&:focusWithin": {
            outline: "2px solid hsl(var(--ring))",
            outlineOffset: "2px",
          },
          "&::placeholder": { color: theme.colors.zinc[4] },
        },
      }),
    }),

    // ---- Card = subtle border + light shadow ----
    Card: Card.extend({
      styles: (theme) => ({
        root: {
          border: "1px solid hsl(var(--border))",
          backgroundColor: "hsl(var(--background))",
          boxShadow: theme.shadows.xs,
        },
      }),
    }),

    // ---- Tabs = underline style ----
    Tabs: Tabs.extend({
      defaultProps: { variant: "default" },
      styles: (theme) => ({
        list: {
          borderBottom: "1px solid hsl(var(--border))",
        },
        tab: {
          border: "none",
          borderRadius: 0,
          background: "transparent",
          color: theme.colors.zinc[7],
          "&[data-active]": {
            color: theme.colors[theme.primaryColor][6],
            boxShadow: `inset 0 -2px 0 ${theme.colors[theme.primaryColor][6]}`,
          },
        },
      }),
    }),
  },
});

export function ShadcnMantineProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: rootCss }} />
      <MantineProvider theme={shadcnTheme} defaultColorScheme="light">
        {children}
      </MantineProvider>
    </>
  );
}
