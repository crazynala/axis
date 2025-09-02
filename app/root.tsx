import { Links, Meta, Outlet, Scripts, ScrollRestoration, NavLink } from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";
import { MantineProvider, AppShell, Anchor, Stack, Title, ColorSchemeScript, ActionIcon, localStorageColorSchemeManager, useMantineColorScheme, useComputedColorScheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import mantineCss from "./styles/mantine.css?url";
export function meta() {
  return [{ title: "ERP Remix" }, { name: "viewport", content: "width=device-width, initial-scale=1" }];
}

export const links: LinksFunction = () => [{ rel: "stylesheet", href: mantineCss }];

export default function App() {
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
        {/* Ensures color scheme is applied before styles to avoid flicker */}
        <ColorSchemeScript defaultColorScheme="light" />
        <Links />
      </head>
      <body>
        <MantineProvider defaultColorScheme="light" colorSchemeManager={localStorageColorSchemeManager({ key: "erp-color-scheme" })}>
          <Notifications />
          <AppShellLayout navItems={navItems} />
          <ScrollRestoration />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}

function AppShellLayout({ navItems }: { navItems: { to: string; label: string }[] }) {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light", { getInitialValueInEffect: false });
  const toggle = () => setColorScheme(computed === "light" ? "dark" : "light");
  return (
    <AppShell padding="lg" navbar={{ width: 260, breakpoint: "sm" }} withBorder>
      <AppShell.Navbar p="md">
        <Title order={3} mb="md">
          ERP Navigation
        </Title>
        <ActionIcon variant="default" onClick={toggle} aria-label="Toggle color scheme" mb="sm">
          <span role="img" aria-label={computed === "light" ? "Switch to dark" : "Switch to light"}>
            {computed === "light" ? "🌙" : "☀️"}
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
  );
}
