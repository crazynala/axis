import { PurchaseOrderDetailView } from "./purchase-orders.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export default function PurchaseOrderDetailIndexRoute() {
  useRegisterNavLocation({
    includeSearch: true,
    moduleKey: "purchase-orders",
  });
  usePersistIndexSearch("/purchase-orders");
  return <PurchaseOrderDetailView />;
}
