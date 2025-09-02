import { Links, Meta, Outlet, Scripts, ScrollRestoration, NavLink } from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";
import { MantineProvider, AppShell, Anchor, Stack, Title, ColorSchemeScript, ActionIcon } from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";
import mantineCss from "./styles/mantine.css?url";

export function meta() {
  return [{ title: "ERP Remix" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

export const links: LinksFunction = () => [{ rel: "stylesheet", href: mantineCss }];

export default function App() {
  const [colorScheme, setColorScheme] = useLocalStorage({ key: "erp-color-scheme", defaultValue: "light" as "light" | "dark" });
  const toggle = () => setColorScheme((v) => (v === "light" ? "dark" : "light"));
  const navItems = [
    { to: "/contacts", label: "Contacts" },
    { to: "/companies", label: "Companies" },
    { to: "/products", label: "Products" },
    { to: "/costings", label: "Costings" },
    { to: "/jobs", label: "Jobs" },
    { to: "/assembly", label: "Assembly" },
    { to: "/assembly-activities", label: "Assembly Activities" },
    { to: "/admin", label: "Admin" },
  ];

  return (
    <html lang="en">
      <head>
        <Meta />
        <ColorSchemeScript />
        <Links />
      </head>
      <body>
        <MantineProvider forceColorScheme={colorScheme}>
          <Notifications />
          <AppShell padding="lg" navbar={{ width: 260, breakpoint: "sm" }} withBorder>
            <AppShell.Navbar p="md">
              <Title order={3} mb="md">
                ERP Navigation
              </Title>
              <ActionIcon variant="default" onClick={toggle} aria-label="Toggle color scheme" mb="sm">
                <span role="img" aria-label={colorScheme === "light" ? "Switch to dark" : "Switch to light"}>
                  {colorScheme === "light" ? "🌙" : "☀️"}
                </span>
              </ActionIcon>
              <Stack gap="xs">
                {navItems.map((item) => (
                  <NavLink key={item.to} to={item.to} prefetch="intent">
                    {({ isActive }) => (
                      <Anchor fw={isActive ? 700 : 500} c={isActive ? "blue.8" : undefined}>
                        {item.label}
                      </Anchor>
                    )}
                  </NavLink>
                ))}
              </Stack>
            </AppShell.Navbar>
            <AppShell.Main>
              <Outlet />
            </AppShell.Main>
          </AppShell>
          <ScrollRestoration />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}
