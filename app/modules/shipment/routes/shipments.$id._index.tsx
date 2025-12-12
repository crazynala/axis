import { ShipmentDetailView } from "./shipments.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export { action } from "./shipments.$id";

export default function ShipmentDetailIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "shipments" });
  usePersistIndexSearch("/shipments");
  return <ShipmentDetailView />;
}
