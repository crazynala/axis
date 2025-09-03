import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Contacts" }];

export async function loader(_args: LoaderFunctionArgs) {
  // No Contact model in schema; use Company as placeholder
  const companies = await prisma.company.findMany({ orderBy: { id: "asc" } });
  return json({ companies });
}

export default function ContactsIndexRoute() {
  const { companies } = useLoaderData<typeof loader>();
  return (
    <div>
      <h1>Contacts</h1>
      <p>Contacts model not yet defined; showing companies as placeholder.</p>
      <section>
        <h3>Companies</h3>
        <ul>
          {companies.map((c: any) => (
            <li key={c.id}>
              <Link to={`/contacts/${c.id}`}>
                {c.name || `Company #${c.id}`}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
