import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Form,
  useLoaderData,
  useLocation,
  useNavigate,
  NavLink as RemixNavLink,
} from "@remix-run/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { loadLogLevels } from "~/utils/log-config.server";
// LinksFunction imported above
import {
  AppShell,
  Anchor,
  Stack,
  Title,
  Group,
  Burger,
  ColorSchemeScript,
  NavLink,
  ActionIcon,
  Divider,
  Modal,
  TextInput,
  Text,
  Paper,
} from "@mantine/core";
import { MantineProvider, createTheme, Input, rem, em } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  GlobalFormProvider,
  SaveCancelHeader,
  useGlobalSaveShortcut,
  RecordBrowserWidget,
} from "@aa/timber";
import { Notifications } from "@mantine/notifications";
import mantineCss from "./styles/mantine.css?url";
import appCss from "./styles/app.css?url";
import { getUser, getUserId } from "./utils/auth.server";
import {
  IconBrandDatabricks,
  IconWoman,
  IconAffiliate,
  IconAutomation,
  IconSettings,
  IconSearch,
  IconAdjustments,
  IconBasketDollar,
  IconFileDollar,
  IconTruck,
  IconCalendarDollar,
} from "@tabler/icons-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const path = url.pathname;
  const publicPaths = ["/login", "/forgot", "/reset"]; // reset uses /reset/:token
  const isPublic = publicPaths.some(
    (p) => path === p || path.startsWith("/reset")
  );
  const logLevels = await loadLogLevels();
  if (isPublic) return json({ colorScheme: "light" as const, logLevels });
  const uid = await getUserId(request);
  if (!uid) {
    const redirectTo = encodeURIComponent(path);
    throw redirect(`/login?redirectTo=${redirectTo}`);
  }
  const me = await getUser(request);
  const colorScheme = (me?.colorScheme as "light" | "dark") ?? "light";
  const desktopNavOpened = me?.desktopNavOpened ?? true;
  return json({ colorScheme, desktopNavOpened, logLevels });
}
export function meta() {
  return [
    { title: "ERP Remix" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: mantineCss },
  { rel: "stylesheet", href: appCss },
];

const theme = createTheme({
  components: {
    InputWrapper: Input.Wrapper.extend({
      styles: (theme) => {
        const mqMd = `@media (minWidth: ${em(theme.breakpoints.md)})`;

        return {
          root: {
            // global: stacked on small, inline on ≥ md
            [mqMd]: {
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              alignItems: "center",
              columnGap: rem(12),
            },

            // opt-in: inline at all sizes
            '&[dataInlineLabel="true"]': {
              display: "grid",
              gridTemplateColumns: "max-content 1fr",
              alignItems: "center",
              columnGap: rem(12),
            },

            // opt-out: stacked at all sizes
            '&[dataInlineLabel="false"]': {
              display: "block",
            },
          },

          label: {
            marginBottom: rem(6),
            [mqMd]: {
              marginBottom: 0,
              justifySelf: "end",
              paddingRight: rem(8),
              whiteSpace: "nowrap",
            },

            // match the per-field overrides
            '[dataInlineLabel="true"] &': {
              marginBottom: 0,
              justifySelf: "end",
              paddingRight: rem(8),
              whiteSpace: "nowrap",
            },
            '[dataInlineLabel="false"] &': {
              marginBottom: rem(6),
              justifySelf: "start",
              paddingRight: 0,
              whiteSpace: "normal",
            },
          },

          description: {
            [mqMd]: { gridColumn: "2 / 3" },
            '[dataInlineLabel="true"] &': { gridColumn: "2 / 3" },
            '[dataInlineLabel="false"] &': { gridColumn: "auto" },
          },

          error: {
            [mqMd]: { gridColumn: "2 / 3" },
            '[dataInlineLabel="true"] &': { gridColumn: "2 / 3" },
            '[dataInlineLabel="false"] &': { gridColumn: "auto" },
          },
        };
      },
    }),
  },
});

export default function App() {
  const data = useLoaderData<typeof loader>();
  const colorScheme = data.colorScheme;
  const logLevels = (data as any).logLevels;
  const desktopNavPref = (data as any).desktopNavOpened ?? true;
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const isAdmin = location.pathname.startsWith("/admin");
  const navTopItems = [
    { to: "/contacts", icon: <IconWoman />, label: "Contacts" },
    { to: "/companies", icon: <IconAffiliate />, label: "Companies" },
    { to: "/products", icon: <IconBrandDatabricks />, label: "Products" },
    { to: "/jobs", icon: <IconAutomation />, label: "Jobs" },
    {
      to: "/purchase-orders",
      icon: <IconBasketDollar />,
      label: "Purchase Orders",
    },
    { to: "/invoices", icon: <IconFileDollar />, label: "Invoices" },
    { to: "/shipments", icon: <IconTruck />, label: "Shipments" },
    { to: "/expenses", icon: <IconCalendarDollar />, label: "Expenses" },
    // Admin-only tools have moved under /admin
  ];
  const navBottomItems = [
    { to: "/assembly", label: "Assembly" },
    { to: "/assembly-activities", label: "Assembly Activities" },
    { to: "/costings", label: "Costings" },
    {
      to: "/admin/value-lists/Category",
      icon: <IconSettings />,
      label: "Admin",
    },
    { to: "/settings", icon: <IconAdjustments />, label: "Settings" },
  ];

  return (
    <html
      lang="en"
      data-mantine-color-scheme={colorScheme}
      suppressHydrationWarning
    >
      <head>
        <Meta />
        {/* Ensures color scheme is applied before styles to avoid flicker */}
        <ColorSchemeScript defaultColorScheme={colorScheme} />
        <Links />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__LOG_LEVELS__=${JSON.stringify(logLevels)};`,
          }}
        />
        <MantineProvider defaultColorScheme={colorScheme} theme={theme}>
          <Notifications />
          {isLogin || isAdmin ? (
            // Public auth pages render without the main AppShell
            <Outlet />
          ) : (
            <GlobalFormProvider>
              <GlobalHotkeys />
              <AppShellLayout
                desktopNavOpenedInitial={desktopNavPref}
                navTopItems={navTopItems}
                navBottomItems={navBottomItems}
              />
            </GlobalFormProvider>
          )}
          <ScrollRestoration />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}

function AppShellLayout({
  desktopNavOpenedInitial,
  navTopItems,
  navBottomItems,
}: {
  desktopNavOpenedInitial: boolean;
  navTopItems: { to: string; label: string; icon?: ReactNode }[];
  navBottomItems: { to: string; label: string; icon?: ReactNode }[];
}) {
  const [mobileNavOpened, { toggle: toggleNavMobile }] = useDisclosure();
  const [desktopNavOpened, { toggle: toggleNavDesktop }] = useDisclosure(
    desktopNavOpenedInitial
  );
  const navigate = useNavigate();
  const location = useLocation();

  // Persist desktop nav toggle per user
  useEffect(() => {
    // no-op on first render; changes only
  }, []);
  useEffect(() => {
    // fire-and-forget; ignore errors
    fetch("/api/nav-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desktopNavOpened }),
    }).catch(() => {});
  }, [desktopNavOpened]);

  // Color scheme toggle moved to settings page
  return (
    <AppShell
      padding="lg"
      navbar={{
        width: desktopNavOpened ? 210 : 45,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpened },
      }}
      withBorder
      header={{ height: 50 }}
    >
      <AppShell.Header>
        <Group justify="space-between" p="xs" align="center">
          <Group w={desktopNavOpened ? 330 : 220} align="center">
            <Burger
              opened={mobileNavOpened}
              onClick={toggleNavMobile}
              hiddenFrom="sm"
              size="sm"
            />
            <Burger
              opened={desktopNavOpened}
              onClick={toggleNavDesktop}
              visibleFrom="sm"
              size="sm"
            />
            <Title order={3}>Axis</Title>
          </Group>
          <SaveCancelHeader>
            <Group gap={6} align="center">
              <GlobalSearchTrigger />
              <RecordBrowserWidget
                navigate={(path: string) => navigate(path)}
                location={{
                  pathname: location.pathname,
                  search: location.search,
                }}
              />
            </Group>
          </SaveCancelHeader>
          <Group w={desktopNavOpened ? 110 : 220} justify="flex-end" />
        </Group>
      </AppShell.Header>
      <AppShell.Navbar py="md" px={desktopNavOpened ? "md" : 0}>
        <Stack justify="space-between" style={{ height: "100%" }}>
          <Stack gap="xs">
            {navTopItems.map((item) => {
              if (desktopNavOpened) {
                return (
                  <NavLink
                    component={RemixNavLink}
                    label={item.label}
                    to={item.to}
                    leftSection={item.icon}
                    key={item.to}
                  />
                );
              } else {
                return (
                  <NavLink
                    px="xs"
                    component={RemixNavLink}
                    label={item.icon}
                    to={item.to}
                    key={item.to}
                  />
                );
              }
            })}
          </Stack>
          <Stack gap="xs">
            {navBottomItems.map((item) => {
              if (desktopNavOpened) {
                return (
                  <NavLink
                    component={RemixNavLink}
                    label={item.label}
                    to={item.to}
                    leftSection={item.icon}
                    key={item.to}
                  />
                );
              } else {
                return (
                  <NavLink
                    component={RemixNavLink}
                    label={item.icon}
                    to={item.to}
                    key={item.to}
                  />
                );
              }
            })}
            <Divider />
            <Form method="post" action="/logout">
              <button
                type="submit"
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  color: "#c00",
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            </Form>
          </Stack>
        </Stack>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}

function GlobalHotkeys() {
  // Register global keyboard shortcuts (Cmd/Ctrl+S => save via GlobalFormProvider)
  useGlobalSaveShortcut();
  return null;
}

function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (cmd && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <ActionIcon
        variant="default"
        aria-label="Search (Cmd+K)"
        onClick={() => setOpen(true)}
        title="Search (Cmd+K)"
      >
        <IconSearch size={18} stroke={1.8} />
      </ActionIcon>
      {open && <GlobalSearchModal onClose={() => setOpen(false)} />}
    </>
  );
}

function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{
    jobs: any[];
    products: any[];
  } | null>(null);
  const fetchResults = useMemo(
    () =>
      debounce(async (value: string) => {
        const url = new URL(`/api/search`, window.location.origin);
        url.searchParams.set("q", value);
        try {
          const res = await fetch(url.toString());
          const data = await res.json();
          setResults(data);
        } catch (e) {
          setResults({ jobs: [], products: [] });
        }
      }, 200),
    []
  );
  useEffect(() => {
    if (!q.trim()) {
      setResults(null);
      return;
    }
    fetchResults(q);
  }, [q, fetchResults]);
  return (
    <Modal opened onClose={onClose} title="Search" centered size="lg">
      <Stack>
        <TextInput
          placeholder="Search jobs, products… (Cmd+K)"
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          autoFocus
        />
        <Stack gap={6}>
          {results?.jobs?.length ? (
            <>
              <Text fw={600} c="dimmed">
                Jobs
              </Text>
              <Paper withBorder p="xs">
                {results.jobs.map((j) => (
                  <RemixNavLink
                    key={`job-${j.id}`}
                    to={`/jobs/${j.id}`}
                    onClick={onClose}
                    prefetch="intent"
                  >
                    {({ isActive }: { isActive: boolean }) => (
                      <Anchor component="span" fw={isActive ? 700 : 500}>
                        {j.id} {j.projectCode ? `(${j.projectCode})` : ""}
                        {j.name || ""}
                      </Anchor>
                    )}
                  </RemixNavLink>
                ))}
              </Paper>
            </>
          ) : null}
          {results?.products?.length ? (
            <>
              <Text fw={600} c="dimmed">
                Products
              </Text>
              <Paper withBorder p="xs">
                {results.products.map((p: any) => (
                  <RemixNavLink
                    key={`prod-${p.id}`}
                    to={`/products/${p.id}`}
                    onClick={onClose}
                    prefetch="intent"
                  >
                    {({ isActive }: { isActive: boolean }) => (
                      <Anchor component="span" fw={isActive ? 700 : 500}>
                        {p.id} {p.sku || ""} {p.name || ""}
                      </Anchor>
                    )}
                  </RemixNavLink>
                ))}
              </Paper>
            </>
          ) : null}
          {!results && <Text c="dimmed">Type to search…</Text>}
          {results && !results.jobs.length && !results.products.length && (
            <Text c="dimmed">No results</Text>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let h: any;
  return ((...args: any[]) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  }) as T;
}
