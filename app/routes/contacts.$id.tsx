import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { BreadcrumbSet, useRecordBrowser, RecordNavButtons, useRecordBrowserShortcuts } from "packages/timber";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [{ title: data?.company ? `Contact ${data.company.name}` : "Contact" }];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Response("Not Found", { status: 404 });
  return json({ company });
}

export default function ContactDetailPlaceholderRoute() {
  const { company } = useLoaderData<typeof loader>();
  // Use company.id as the current record id for navigation
  useRecordBrowserShortcuts(company.id);
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Contacts", href: "/contacts" },
          { label: company.name || String(company.id), href: `/contacts/${company.id}` },
        ]}
      />
      <RecordNavButtons recordBrowser={useRecordBrowser(company.id)} />
      <h1>Contact</h1>
      <p>This is a placeholder detail page using Company data until Contact exists.</p>
      <p>
        <strong>Name:</strong> {company.name}
      </p>
      <p>
        <Link to="/contacts">Back</Link>
      </p>
    </div>
  );
}
