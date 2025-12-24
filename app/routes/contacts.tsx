import { Outlet } from "@remix-run/react";

export default function ContactsLayout() {
  // Legacy RecordBrowserContext removed; roster handled in higher-level RecordContext index routes.
  return <Outlet />;
}
