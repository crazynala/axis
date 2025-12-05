import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, NavLink as RemixNavLink } from "@remix-run/react";
import { AppShell, Divider, NavLink, Stack, Title } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { requireAdminUser } from "~/utils/auth.server";

const items = [
  { to: "/admin/import", label: "Excel Import" },
  { to: "/admin/logging", label: "Logging" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/value-lists/Tax", label: "Value Lists: Tax Codes" },
  { to: "/admin/value-lists/Category", label: "Value Lists: Category" },
  { to: "/admin/value-lists/ProductType", label: "Value Lists: Product Type" },
  { to: "/admin/value-lists/JobType", label: "Value Lists: Job Type" },
  { to: "/admin/value-lists/Currency", label: "Value Lists: Currency" },
  {
    to: "/admin/value-lists/ShippingMethod",
    label: "Value Lists: Shipping Method",
  },
  { to: "/admin/cost-groups", label: "Cost Groups" },
  { to: "/admin/cost-ranges", label: "Cost Ranges" },
  { to: "/admin/sale-price-groups", label: "Sale Price Groups" },
  { to: "/admin/forex/USD/TRY", label: "Forex: USD→TRY" },
  { to: "/admin/dhl-records", label: "DHL Records" },
  { to: "/admin/settings/pricing", label: "Pricing Settings" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  return null;
}

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
