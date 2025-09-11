import { Outlet, NavLink as RemixNavLink } from "@remix-run/react";
import { AppShell, Divider, NavLink, Stack, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";

const items = [
  { to: "/admin/import", label: "Excel Import" },
  { to: "/admin/logging", label: "Logging" },
  { to: "/admin/value-lists/Tax", label: "Value Lists: Tax Codes" },
  { to: "/admin/value-lists/Category", label: "Value Lists: Category" },
  { to: "/admin/value-lists/ProductType", label: "Value Lists: Product Type" },
  { to: "/admin/value-lists/JobType", label: "Value Lists: Job Type" },
  { to: "/admin/value-lists/JobStatus", label: "Value Lists: Job Status" },
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
            <NavLink
              component={RemixNavLink}
              to="/"
              label="Close"
              leftSection={<IconArrowLeft />}
            />
            <Divider />
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
