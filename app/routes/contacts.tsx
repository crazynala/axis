import type { LoaderFunctionArgs, MetaFunction, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { prisma } from "../utils/prisma.server";

export const meta: MetaFunction = () => [{ title: "Contacts" }];

export async function loader(_args: LoaderFunctionArgs) {
  // No Contact model in schema yet; show placeholder list via Company for now
  const companies = await prisma.company.findMany({ orderBy: { id: "asc" } });
  return json({ companies });
}

export async function action({ request }: ActionFunctionArgs) {
  // Placeholder action: no-op redirect
  await request.formData();
  return redirect("/contacts");
}

export default function ContactsRoute() {
  const { companies } = useLoaderData<typeof loader>();
  const nav = useNavigation();
  const busy = nav.state !== "idle";

  return (
    <div>
      <h1>Contacts</h1>
      <p>Contacts model not yet defined; showing companies as placeholder.</p>
      <section>
        <h3>Companies</h3>
        <ul>
          {companies.map((c: any) => (
            <li key={c.id}>{c.name}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
