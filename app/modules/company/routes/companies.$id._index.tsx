import { CompanyDetailView } from "./companies.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export default function CompanyDetailIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "companies" });
  usePersistIndexSearch("/companies");
  return <CompanyDetailView />;
}
