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
  const { setCurrentId, nextId, prevId } = useRecordContext();
  useEffect(() => {
    setCurrentId(company.id);
  }, [company.id, setCurrentId]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "ArrowLeft") {
        const p = prevId(company.id as any);
        if (p != null) {
          e.preventDefault();
          window.location.href = `/contacts/${p}`;
        }
      } else if (e.key === "ArrowRight") {
        const n = nextId(company.id as any);
        if (n != null) {
          e.preventDefault();
          window.location.href = `/contacts/${n}`;
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [company.id, nextId, prevId]);
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
      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <button
          onClick={() => {
            const p = prevId(company.id as any);
            if (p != null) window.location.href = `/contacts/${p}`;
          }}
          disabled={!prevId(company.id as any)}
        >
          Prev
        </button>
        <button
          onClick={() => {
            const n = nextId(company.id as any);
            if (n != null) window.location.href = `/contacts/${n}`;
          }}
          disabled={!nextId(company.id as any)}
        >
          Next
        </button>
      </div>
      <h1>Contact</h1>
      <p>
        This is a placeholder detail page using Company data until Contact
        exists.
      </p>
      <p>
        <strong>Name:</strong> {company.name}
      </p>
      <p>
        <Link to="/contacts">Back</Link>
      </p>
    </div>
  );
}
