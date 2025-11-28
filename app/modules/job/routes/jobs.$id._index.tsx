import { JobDetailView } from "./jobs.$id";
import {
  useRegisterNavLocation,
  usePersistIndexSearch,
} from "~/hooks/useNavLocation";

export { action } from "./jobs.$id";

export default function JobDetailIndexRoute() {
  useRegisterNavLocation({ includeSearch: true, moduleKey: "jobs" });
  usePersistIndexSearch("/jobs");
  return <JobDetailView />;
}
