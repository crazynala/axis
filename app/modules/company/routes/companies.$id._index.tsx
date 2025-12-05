import { CompanyDetailView } from "./companies.$id";
import type { ActionFunctionArgs } from "@remix-run/node";
import { action as companyAction } from "./companies.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export async function action(args: ActionFunctionArgs) {
  return companyAction(args as any);
}

export default function CompanyDetailIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "companies" });
  usePersistIndexSearch("/companies");
  return <CompanyDetailView />;
}
