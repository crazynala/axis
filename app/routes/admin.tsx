import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, NavLink as RemixNavLink, useLocation } from "@remix-run/react";
import { AppShell, Divider, NavLink, Stack, Title } from "@mantine/core";
import {
  IconArrowLeft,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react";
import { requireAdminUser } from "~/utils/auth.server";
import { useEffect, useState } from "react";

type NavLinkItem = { to: string; label: string };
type NavGroupItem = {
  kind: "group";
  key: string;
  parent: NavLinkItem;
  children: NavLinkItem[];
};
type NavMenuItem = NavLinkItem | NavGroupItem;

const items: NavMenuItem[] = [
  {
    kind: "group",
    key: "admin-value-lists",
    parent: { to: "/admin/value-lists/Category", label: "Value Lists" },
    children: [
      { to: "/admin/value-lists/Category", label: "Category" },
      { to: "/admin/value-lists/JobType", label: "Job Type" },
      { to: "/admin/value-lists/ProductType", label: "Product Type" },
      { to: "/admin/value-lists/DefectReason", label: "Defect Reasons" },
      { to: "/admin/value-lists/Tax", label: "Tax Codes" },
      { to: "/admin/value-lists/Currency", label: "Currency" },
      { to: "/admin/value-lists/ShippingMethod", label: "Shipping Methods" },
    ],
  },
  { to: "/admin/product-attributes", label: "Product Metadata" },
  {
    kind: "group",
    key: "admin-costs",
    parent: { to: "/admin/cost-groups", label: "Pricing" },
    children: [
      { to: "/admin/cost-groups", label: "Cost Groups" },
      { to: "/admin/cost-ranges", label: "Cost Ranges" },
      { to: "/admin/pricing-specs", label: "Price Specs" },
    ],
  },
  {
    kind: "group",
    key: "admin-data-import",
    parent: { to: "/admin/import", label: "Data Import" },
    children: [
      { to: "/admin/forex/USD/TRY", label: "Forex: USD→TRY" },
      { to: "/admin/dhl-records", label: "DHL Records" },
      { to: "/admin/import", label: "Excel Import" },
    ],
  },
  { to: "/admin/logging", label: "Logging" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/settings", label: "Global Settings" },
];

const isGroupItem = (item: NavMenuItem): item is NavGroupItem =>
  (item as NavGroupItem).kind === "group";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  return null;
}

export default function AdminLayoutRoute() {
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const isGroupActive = (group: NavGroupItem) => {
    const paths = [group.parent.to, ...group.children.map((c) => c.to)];
    return paths.some(
      (path) =>
        location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };
  useEffect(() => {
    const next: Record<string, boolean> = {};
    items.forEach((item) => {
      if (!isGroupItem(item)) return;
      next[item.key] = isGroupActive(item);
    });
    setOpenGroups((prev) => ({ ...next, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };
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
            {items.map((it) => {
              if (isGroupItem(it)) {
                const active = isGroupActive(it);
                const open = openGroups[it.key] ?? active;
                return (
                  <div key={it.key}>
                    <NavLink
                      label={it.parent.label}
                      onClick={() => toggleGroup(it.key)}
                      rightSection={
                        open ? (
                          <IconChevronDown size={14} />
                        ) : (
                          <IconChevronRight size={14} />
                        )
                      }
                      fw={open ? 600 : 400}
                    />
                    {open ? (
                      <Stack gap={0} pl="md">
                        {it.children.map((child) => (
                          <NavLink
                            component={RemixNavLink}
                            to={child.to}
                            key={child.to}
                            label={child.label}
                          />
                        ))}
                      </Stack>
                    ) : null}
                  </div>
                );
              }
              return (
                <NavLink
                  component={RemixNavLink}
                  to={it.to}
                  key={it.to}
                  label={it.label}
                />
              );
            })}
          </Stack>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
