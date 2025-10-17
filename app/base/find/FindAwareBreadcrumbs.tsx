import React from "react";
import { useFindHrefAppender } from "~/base/find/sessionFindState";

type Crumb = { label: string; href: string };

// Generic wrapper: given a breadcrumb component and crumbs, rewrite hrefs to include persisted view/find state.
export function FindAwareBreadcrumbSet(props: {
  // A breadcrumb component that accepts `breadcrumbs` prop
  Component: React.ComponentType<{ breadcrumbs: Crumb[] }>;
  breadcrumbs: Crumb[];
}) {
  const append = useFindHrefAppender();
  const items = props.breadcrumbs.map((c) => ({ ...c, href: append(c.href) }));
  const Cmp = props.Component;
  return <Cmp breadcrumbs={items} />;
}
