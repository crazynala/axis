import { Outlet, NavLink as RemixNavLink } from "@remix-run/react";
import { AppShell, NavLink, Stack, Title } from "@mantine/core";

const items = [
  { to: "/admin/import", label: "Excel Import" },
  { to: "/admin/logging", label: "Logging" },
  { to: "/admin/value-lists/Tax", label: "Value Lists: Tax Codes" },
  { to: "/admin/value-lists/Category", label: "Value Lists: Category" },
  { to: "/admin/value-lists/Subcategory", label: "Value Lists: Subcategory" },
  { to: "/admin/forex/USD/TRY", label: "Forex: USD→TRY" },
  { to: "/admin/dhl-records", label: "DHL Records" },
];

export default function AdminLayoutRoute() {
  return (
    <AppShell
      padding="lg"
      navbar={{ width: 240, breakpoint: "sm" }}
      header={{ height: 0 }}
    >
      <AppShell.Navbar p="md">
        <Stack>
          <Title order={4}>Admin</Title>
          <Stack gap="xs">
            {items.map((it) => (
              <NavLink
                component={RemixNavLink}
                to={it.to}
                key={it.to}
                label={it.label}
              />
            ))}
          </Stack>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
