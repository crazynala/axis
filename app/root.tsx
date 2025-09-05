import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  NavLink,
  Form,
  useLoaderData,
  useLocation,
} from "@remix-run/react";
import { useEffect, useState, type ReactNode } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import type { LinksFunction } from "@remix-run/node";
import {
  AppShell,
  Anchor,
  Stack,
  Title,
  Group,
  Burger,
  ColorSchemeScript,
  ActionIcon,
  useMantineColorScheme,
  useComputedColorScheme,
  Divider,
} from "@mantine/core";
import { MantineProvider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  GlobalFormProvider,
  SaveCancelHeader,
  useGlobalSaveShortcut,
} from "packages/timber";
import { Notifications } from "@mantine/notifications";
import mantineCss from "./styles/mantine.css?url";
import { getUser, getUserId } from "./utils/auth.server";
import {
  IconBrandDatabricks,
  IconWoman,
  IconAffiliate,
  IconAutomation,
  IconSettings,
} from "@tabler/icons-react";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const path = url.pathname;
  const publicPaths = ["/login", "/forgot", "/reset"]; // reset uses /reset/:token
  const isPublic = publicPaths.some(
    (p) => path === p || path.startsWith("/reset")
  );
  if (isPublic) return json({ colorScheme: "light" as const });
  const uid = await getUserId(request);
  if (!uid) {
    const redirectTo = encodeURIComponent(path);
    throw redirect(`/login?redirectTo=${redirectTo}`);
  }
  const me = await getUser(request);
  const colorScheme = (me?.colorScheme as "light" | "dark") ?? "light";
  return json({ colorScheme });
}
export function meta() {
  return [
    { title: "ERP Remix" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
  ];
}

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: mantineCss },
];

export default function App() {
  const { colorScheme } = useLoaderData<typeof loader>();
  const location = useLocation();
  const isLogin = location.pathname === "/login";
  const navTopItems = [
    { to: "/contacts", icon: <IconWoman />, label: "Contacts" },
    { to: "/companies", icon: <IconAffiliate />, label: "Companies" },
    { to: "/products", icon: <IconBrandDatabricks />, label: "Products" },
    { to: "/costings", label: "Costings" },
    { to: "/jobs", icon: <IconAutomation />, label: "Jobs" },
    { to: "/assembly", label: "Assembly" },
    { to: "/assembly-activities", label: "Assembly Activities" },
  ];
  const navBottomItems = [
    { to: "/admin", label: "Admin" },
    { to: "/settings", icon: <IconSettings />, label: "Settings" },
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
        <MantineProvider defaultColorScheme={colorScheme}>
          <Notifications />
          <GlobalFormProvider>
            <GlobalHotkeys />
            {!isLogin && <SaveCancelHeader />}
            {isLogin ? (
              <Outlet />
            ) : (
              <AppShellLayout
                navTopItems={navTopItems}
                navBottomItems={navBottomItems}
              />
            )}
          </GlobalFormProvider>
          <ScrollRestoration />
          <Scripts />
        </MantineProvider>
      </body>
    </html>
  );
}

function AppShellLayout({
  navTopItems,
  navBottomItems,
}: {
  navTopItems: { to: string; label: string; icon?: ReactNode }[];
  navBottomItems: { to: string; label: string; icon?: ReactNode }[];
}) {
  const [mobileNavOpened, { toggle: toggleNavMobile }] = useDisclosure();
  const [desktopNavOpened, { toggle: toggleNavDesktop }] = useDisclosure(true);

  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme("light", {
    // Read color scheme on client to avoid SSR/client mismatch
    getInitialValueInEffect: true,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const modeToggle = async () => {
    const next = computed === "light" ? "dark" : "light";
    try {
      await fetch("/api/color-scheme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ colorScheme: next }),
      });
    } catch (e) {
      // ignore network errors; still update UI
    }
    setColorScheme(next);
  };
  return (
    <AppShell
      padding="lg"
      navbar={{
        width: 220,
        breakpoint: "sm",
        collapsed: { mobile: !mobileNavOpened, desktop: !desktopNavOpened },
      }}
      withBorder
      header={{ height: 60 }}
    >
      <AppShell.Header>
        <Group justify="space-between" p="xs" align="center">
          <Group align="center" gap="xl">
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
          <ActionIcon
            variant="default"
            onClick={modeToggle}
            aria-label="Toggle color scheme"
            mb="sm"
          >
            <span role="img" aria-hidden suppressHydrationWarning>
              {mounted ? (computed === "light" ? "🌙" : "☀️") : "🌙"}
            </span>
          </ActionIcon>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        <Stack justify="space-between" style={{ height: "100%" }}>
          <Stack gap="xs">
            {navTopItems.map((item) => (
              <NavLink key={item.to} to={item.to} prefetch="intent">
                {({ isActive }) => (
                  // Render Anchor as span to avoid <a> inside <a>
                  <Anchor component="span" fw={isActive ? 700 : 500}>
                    {item.icon} {item.label}
                  </Anchor>
                )}
              </NavLink>
            ))}
          </Stack>
          <Stack gap="xs">
            {navBottomItems.map((item) => (
              <NavLink key={item.to} to={item.to} prefetch="intent">
                {({ isActive }) => (
                  // Render Anchor as span to avoid <a> inside <a>
                  <Anchor component="span" fw={isActive ? 700 : 500}>
                    {item.icon} {item.label}
                  </Anchor>
                )}
              </NavLink>
            ))}
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
