import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { BoxDetailForm } from "./BoxDetailForm";
import type { BoxFindValues } from "../findify/box.search-schema";
import { allBoxFieldConfigs } from "../forms/boxDetail";
import { buildBoxFindDefaults } from "../findify/boxFindify";

export interface BoxFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void;
  initialValues?: Partial<BoxFindValues>;
}

export function BoxFindModal(props: BoxFindModalProps) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      adapter={{
        buildDefaults: buildBoxFindDefaults,
        allFields: allBoxFieldConfigs,
        title: "Find Boxes",
      }}
      FormComponent={BoxDetailForm as any}
    />
  );
}
