import { InvoiceDetailView } from "./invoices.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export default function InvoiceDetailIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "invoices" });
  usePersistIndexSearch("/invoices");
  return <InvoiceDetailView />;
}
