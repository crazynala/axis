import { Button } from "@mantine/core";
import { GenericMultiFindModal } from "~/components/find/GenericMultiFindModal";
import { BoxDetailForm } from "./BoxDetailForm";
import type { BoxFindValues } from "../findify/box.search-schema";
import { buildBoxFindDefaults } from "../findify/boxFindify";
import { boxSpec } from "../spec";
import type { MultiFindState } from "~/base/find/multiFind";

export interface BoxFindModalProps {
  opened: boolean;
  onClose: () => void;
  onSearch: (qs: string) => void;
  initialValues?: Partial<BoxFindValues>;
  initialMode?: "simple" | "advanced";
  initialMulti?: MultiFindState | null;
  restoreQs?: string | null;
  onRestore?: (qs: string) => void;
}

export function BoxFindModal(props: BoxFindModalProps) {
  return (
    <GenericMultiFindModal
      opened={props.opened}
      onClose={props.onClose}
      onSearch={props.onSearch}
      initialValues={props.initialValues}
      initialMode={props.initialMode}
      initialMulti={props.initialMulti}
      headerActions={
        props.onRestore ? (
          <Button
            size="xs"
            variant="subtle"
            disabled={!props.restoreQs}
            onClick={() => {
              if (!props.restoreQs) return;
              props.onRestore?.(props.restoreQs);
            }}
            type="button"
          >
            Restore
          </Button>
        ) : null
      }
      adapter={{
        buildDefaults: buildBoxFindDefaults,
        allFields: boxSpec.find.buildConfig,
        title: "Find Boxes",
      }}
      FormComponent={BoxDetailForm as any}
    />
  );
}
