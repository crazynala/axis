import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { BreadcrumbSet } from "@aa/timber";
import { useRecordContext } from "../record/RecordContext";
import { useEffect } from "react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.company ? `Contact ${data.company.name}` : "Contact" },
];

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);
  if (!id) throw new Response("Not Found", { status: 404 });
  const company = await prisma.company.findUnique({ where: { id } });
  if (!company) throw new Response("Not Found", { status: 404 });
  return json({ company });
}

export default function ContactDetailPlaceholderRoute() {
  const { company } = useLoaderData<typeof loader>();
  const { setCurrentId } = useRecordContext();
  useEffect(() => {
    setCurrentId(company.id);
  }, [company.id, setCurrentId]);
  // Prev/Next keyboard navigation handled globally in RecordProvider
  return (
    <div>
      <BreadcrumbSet
        breadcrumbs={[
          { label: "Contacts", href: "/contacts" },
          {
            label: company.name || String(company.id),
            href: `/contacts/${company.id}`,
          },
        ]}
      />
      <div style={{ height: 0 }} />
      <h1>Contact</h1>
      <p>
        This is a placeholder detail page using Company data until Contact
        exists.
      </p>
      <p>
        <strong>Name:</strong> {company.name}
      </p>
      <p></p>
    </div>
  );
}
