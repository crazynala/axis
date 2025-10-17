import {
  Links,
  Meta,
  Outlet,
  Scripts,
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
  Card,
  Button,
  Burger,
  ColorSchemeScript,
  NavLink,
  ActionIcon,
  Divider,
  TextInput,
  Text,
  Paper,
  Modal,
} from "@mantine/core";
import {
  MantineProvider,
  virtualColor,
  createTheme,
  Input,
  rem,
  em,
  type CSSVariablesResolver,
} from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { HotkeyAwareModal } from "./base/hotkeys/HotkeyAwareModal";
import { useDisclosure } from "@mantine/hooks";
import {
  GlobalFormProvider,
  SaveCancelHeader,
  useGlobalSaveShortcut,
  RecordBrowserWidget,
} from "@aa/timber";
import { Notifications } from "@mantine/notifications";

import "./styles/css-layers.css";
import "react-datasheet-grid/dist/style.layer.css";
import "@mantine/core/styles.layer.css";
import "@mantine/dates/styles.layer.css";
import "@mantine/notifications/styles.layer.css";
import "mantine-datatable/styles.layer.css";
import "./styles/app.layer.css";
import { getUser, getUserId } from "./utils/auth.server";
import { FindProvider } from "./base/find/FindContext";
import {
  RecordProvider,
  GlobalRecordBrowser,
} from "./base/record/RecordContext";
import { HotkeyProvider } from "./base/hotkeys/HotkeyContext";
import { loadOptions } from "./utils/options.server";
import { type OptionsData } from "./base/options/OptionsClient";
import { OptionsProvider } from "./base/options/OptionsContext";
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
  IconChartHistogram,
} from "@tabler/icons-react";
import { useFind } from "./base/find/FindContext";
// import { prisma } from "./utils/prisma.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const path = url.pathname;
  const publicPaths = ["/login", "/forgot", "/reset"]; // reset uses /reset/:token
  const isPublic = publicPaths.some(
    (p) => path === p || path.startsWith("/reset") || path.startsWith("/api")
  );
  const logLevels = await loadLogLevels();
  if (isPublic)
    return json({
      colorScheme: "light" as const,
      logLevels,
      options: null,
      desktopNavOpened: true,
    });
  const uid = await getUserId(request);
  if (!uid) {
    const redirectTo = encodeURIComponent(path);
    throw redirect(`/login?redirectTo=${redirectTo}`);
  }
  const me = await getUser(request);
  const colorScheme: "light" | "dark" =
    (me?.colorScheme as "light" | "dark" | undefined) || "light";
  const desktopNavOpened = me?.desktopNavOpened ?? true;
  const options = await loadOptions();
  // console.log("Root loaded options: ", options);
  return json({ colorScheme, desktopNavOpened, logLevels, options });
}
// export const links: LinksFunction = () => {
// If Remix CSS bundling is enabled, we could also include cssBundleHref here.
// Using explicit stylesheet links to ensure production server serves CSS.
// return [
//   { rel: "stylesheet", href: mantineStylesHref as string },
//   { rel: "stylesheet", href: appStylesHref as string },
// ];
// };

export function meta() {
  return [
    { title: "Holy shit! It's AXIS" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

const theme = createTheme({
  primaryShade: { light: 6, dark: 9 },
  colors: {
    slate: [
      "#B5BFC4ff",
      "#A1ABB0ff",
      "#8E979Cff",
      "#7A8388ff",
      "#677075ff",
      "#535C61ff",
      "#40484Dff",
      "#2C3439ff",
      "#192025ff",
      "#111619ff",
    ],
  },
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
    Modal: Modal.extend({
      defaultProps: {
        overlayProps: {
          backgroundOpacity: 0.7,
          blur: 1,
        },
      },
    }),
    Card: Card.extend({
      defaultProps: {
        bg: "var(--aa-card-bg)",
      },
    }),
  },
});

const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {
    // shared (both schemes)
    "--dsg-selection-border-radius": "2px",
    "--dsg-selection-border-width": "2px",
    "--dsg-transition-duration": "0.1s",
    "--dsg-corner-indicator-width": "10px",
    "--dsg-expand-rows-indicator-width": "10px",
    "--dsg-scroll-shadow-width": "7px",
  },
  light: {
    "--aa-card-bg": t.colors.gray[0],
    "--dsg-border-color": t.colors.gray[3],
    "--dsg-selection-border-color": `var(--mantine-primary-color-filled)`,
    "--dsg-selection-background-color":
      "color-mix(in oklab, var(--mantine-primary-color-filled) 6%, transparent)",
    "--dsg-selection-disabled-border-color": t.colors.gray[5],
    "--dsg-selection-disabled-background-color": "rgba(0,0,0,.04)",
    "--dsg-header-text-color": t.colors.gray[6],
    "--dsg-header-active-text-color": "black",
    "--dsg-cell-background-color": t.white,
    "--dsg-cell-disabled-background-color": t.colors.gray[0],
    "--dsg-scroll-shadow-color": "rgba(0,0,0,.2)",
  },
  dark: {
    "--aa-card-bg": t.colors.dark[8],
    "--mantine-color-body": t.colors.dark[9],
    "--dsg-border-color": t.colors.dark[5],
    "--dsg-selection-border-color": `var(--mantine-primary-color-filled)`,
    "--dsg-selection-background-color":
      "color-mix(in oklab, var(--mantine-primary-color-filled) 10%, transparent)",
    "--dsg-selection-disabled-border-color": t.colors.dark[3],
    "--dsg-selection-disabled-background-color": "rgba(255,255,255,.04)",
    "--dsg-header-text-color": t.colors.dark[2],
    "--dsg-header-active-text-color": t.white,
    "--dsg-cell-background-color": t.colors.dark[7],
    "--dsg-cell-disabled-background-color": t.colors.dark[6],
    "--dsg-scroll-shadow-color": "rgba(0,0,0,.5)",
  },
});

export default function App() {
  const data = useLoaderData<typeof loader>();
  const colorScheme = data.colorScheme;
  const logLevels = data.logLevels;
  const desktopNavPref = data.desktopNavOpened ?? true;
  const options: OptionsData | undefined = data.options ?? undefined;
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const isAdmin = location.pathname.startsWith("/admin");
  const isSuppressAppShell = location.pathname.includes("fullzoom");

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
    { to: "/analytics", icon: <IconChartHistogram />, label: "Analytics" },
    // Admin-only tools have moved under /admin
  ];
  const navBottomItems = [
    {
      to: "/admin/value-lists/Category",
      icon: <IconSettings />,
      label: "Admin",
    },
    { to: "/settings", icon: <IconAdjustments />, label: "Settings" },
  ];

  return (
    <>
      {/* If using Mantine v7: */}
      {/* <ColorSchemeScript defaultColorScheme={colorScheme} /> */}
      <html
        lang="en"
        data-mantine-color-scheme={colorScheme}
        suppressHydrationWarning
      >
        <head>
          <meta charSet="utf-8" />
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
          <MantineProvider
            defaultColorScheme={colorScheme}
            theme={theme}
            cssVariablesResolver={cssVariablesResolver}
          >
            <ModalsProvider>
              <Notifications />
              {isLogin || isAdmin ? (
                // Public auth pages render without the main AppShell or providers
                <Outlet />
              ) : (
                <FindProvider>
                  <HotkeyProvider disabled={isSuppressAppShell}>
                    <RecordProvider>
                      <GlobalFormProvider>
                        <OptionsProvider value={options ?? null}>
                          <GlobalHotkeys />
                          {isSuppressAppShell ? (
                            <Outlet />
                          ) : (
                            <AppShellLayout
                              desktopNavOpenedInitial={desktopNavPref}
                              navTopItems={navTopItems}
                              navBottomItems={navBottomItems}
                              disabled={isAdmin}
                            />
                          )}
                        </OptionsProvider>
                      </GlobalFormProvider>
                    </RecordProvider>
                  </HotkeyProvider>
                </FindProvider>
              )}
            </ModalsProvider>
            <Scripts />
          </MantineProvider>
        </body>
      </html>
    </>
  );
}

function AppShellLayout({
  desktopNavOpenedInitial,
  navTopItems,
  navBottomItems,
  disabled,
}: {
  desktopNavOpenedInitial: boolean;
  navTopItems: { to: string; label: string; icon?: ReactNode }[];
  navBottomItems: { to: string; label: string; icon?: ReactNode }[];
  disabled?: boolean;
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
      disabled={disabled}
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
          <SaveCancelHeader></SaveCancelHeader>
          <Group justify="flex-end">
            {/* w={desktopNavOpened ? 110 : 220} */}
            <GlobalFindTrigger />
            <GlobalRecordBrowser />
            {/* Hotkeys now centralized in RecordProvider */}
          </Group>
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
  // Cmd/Ctrl+F => open contextual Find if supported
  const location = useLocation();
  const { triggerFind } = useFind();
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (!cmd) return;
      if (e.key === "f" || e.key === "F") {
        // If user is typing inside an input/textarea/contenteditable, allow native find
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName;
          if (
            tag === "INPUT" ||
            tag === "TEXTAREA" ||
            target.isContentEditable
          ) {
            return;
          }
        }
        if (isFindCapablePath(location.pathname)) {
          e.preventDefault();
          triggerFind();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [location.pathname, triggerFind]);
  return null;
}

// Utility: which paths support find
function isFindCapablePath(pathname: string): boolean {
  // Modules with registered FindManagers
  if (pathname.startsWith("/jobs")) return true;
  if (pathname === "/products" || pathname.startsWith("/products/"))
    return true;
  if (pathname.startsWith("/companies")) return true;
  if (pathname.startsWith("/purchase-orders")) return true;
  if (pathname.startsWith("/invoices")) return true;
  if (pathname.startsWith("/shipments")) return true;
  if (pathname.startsWith("/expenses")) return true;
  return false;
}

// Central handler to invoke find behavior per module
function GlobalFindTrigger() {
  const location = useLocation();
  const { triggerFind } = useFind();
  if (!isFindCapablePath(location.pathname)) return null;
  return (
    <Button
      variant="default"
      size="xs"
      leftSection={<IconSearch size={14} stroke={1.5} />}
      onClick={() => triggerFind()}
    >
      ⌘F
    </Button>
  );
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
    <HotkeyAwareModal
      opened
      onClose={onClose}
      title="Search"
      centered
      size="lg"
    >
      <Stack>
        <TextInput
          placeholder="Search jobs, products... (Cmd+K)"
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
          {!results && <Text c="dimmed">Type to search...</Text>}
          {results && !results.jobs.length && !results.products.length && (
            <Text c="dimmed">No results</Text>
          )}
        </Stack>
      </Stack>
    </HotkeyAwareModal>
  );
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let h: any;
  return ((...args: any[]) => {
    clearTimeout(h);
    h = setTimeout(() => fn(...args), ms);
  }) as T;
}
