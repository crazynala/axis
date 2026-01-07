import { useCallback, useEffect, useRef } from "react";
import { useFind } from "./FindContext";
import { useForm } from "react-hook-form";

export type BaseFindifyConfig<TEdit extends object, TFind extends object> = {
  buildEditDefaults: (record: any) => TEdit;
  buildFindDefaults: () => TFind;
  record: any; // full record for defaults
  navState?: string;
  // Called when navigation completes after a find redirect
  onSearchNavigate?: () => void;
};

export function useBaseFindify<TEdit extends object, TFind extends object>(
  config: BaseFindifyConfig<TEdit, TFind>
) {
  const { mode, setMode } = useFind();
  const editDefaults = config.buildEditDefaults(config.record);
  const findDefaults = config.buildFindDefaults();
  const editForm = useForm<TEdit>({
    defaultValues: editDefaults as any,
    shouldUnregister: false,
  });
  const findForm = useForm<TFind>({
    defaultValues: findDefaults as any,
    shouldUnregister: false,
  });
  const wasSubmitting = useRef(false);

  // Reset edit form on record id change; leave find mode
  useEffect(() => {
    editForm.reset(config.buildEditDefaults(config.record) as any);
    setMode("edit");
  }, [config.record?.id]);

  useEffect(() => {
    if (!config.navState) return;
    const submitting = config.navState !== "idle";
    if (mode === "find") {
      if (!wasSubmitting.current && submitting) wasSubmitting.current = true;
      if (wasSubmitting.current && !submitting) {
        setMode("edit");
        wasSubmitting.current = false;
        config.onSearchNavigate?.();
      }
    } else if (!submitting) {
      wasSubmitting.current = false;
    }
  }, [config.navState, mode]);

  const enterFind = useCallback(() => {
    if (editForm.formState.isDirty) {
      window.alert("Save or discard changes before entering Find mode.");
      return false;
    }
    findForm.reset(config.buildFindDefaults());
    setMode("find");
    return true;
  }, [editForm.formState.isDirty, findForm, setMode]);
  const exitFind = useCallback(() => setMode("edit"), [setMode]);
  const toggleFind = useCallback(() => {
    if (mode === "find") return exitFind();
    enterFind();
  }, [mode, enterFind, exitFind]);

  const activeForm: any = mode === "find" ? findForm : editForm;
  return {
    editForm,
    findForm,
    activeForm,
    mode,
    enterFind,
    exitFind,
    toggleFind,
  };
}
