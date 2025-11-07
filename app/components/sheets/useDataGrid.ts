import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DataGridOperation<T = any> =
  | { type: "CREATE"; fromRowIndex: number; toRowIndex: number }
  | { type: "UPDATE"; fromRowIndex: number; toRowIndex: number }
  | { type: "DELETE"; fromRowIndex: number; toRowIndex: number };

type UseDataGridOptions<T> = {
  initialData: T[];
  getRowId?: (row: T) => string | number | undefined | null;
  createRow?: () => T;
  duplicateRow?: (args: { rowData: T }) => T;
  lockRows?: boolean;
};

export function useDataGrid<T = any>({
  initialData,
  getRowId,
  createRow,
  duplicateRow,
  lockRows = false,
}: UseDataGridOptions<T>) {
  const [value, setValue] = useState<T[]>(initialData || []);
  const prevDataRef = useRef<T[]>(initialData || []);
  const createdRowIds = useMemo(() => new Set<string | number>(), []);
  const deletedRowIds = useMemo(() => new Set<string | number>(), []);
  const updatedRowIds = useMemo(() => new Set<string | number>(), []);

  const idOf = (row: T) => {
    try {
      const id = getRowId ? getRowId(row) : (row as any)?.id;
      return id == null ? undefined : (id as any);
    } catch {
      return undefined;
    }
  };

  const onChange = useCallback(
    (newValue: T[], operations?: DataGridOperation<T>[]) => {
      let next = newValue.slice();
      for (const op of operations || []) {
        if (op.type === "CREATE") {
          if (lockRows) {
            // Revert inserted rows
            next.splice(op.fromRowIndex, op.toRowIndex - op.fromRowIndex);
            continue;
          }
          next.slice(op.fromRowIndex, op.toRowIndex).forEach((row) => {
            const id = idOf(row);
            if (id != null) createdRowIds.add(id);
          });
        } else if (op.type === "UPDATE") {
          next.slice(op.fromRowIndex, op.toRowIndex).forEach((row) => {
            const id = idOf(row);
            if (id == null) return;
            if (!createdRowIds.has(id) && !deletedRowIds.has(id)) {
              updatedRowIds.add(id);
            }
          });
        } else if (op.type === "DELETE") {
          let kept = 0;
          const prev = prevDataRef.current;
          prev.slice(op.fromRowIndex, op.toRowIndex).forEach((row, i) => {
            const id = idOf(row);
            if (id != null) updatedRowIds.delete(id);
            if (id != null && createdRowIds.has(id)) {
              createdRowIds.delete(id);
            } else if (id != null) {
              deletedRowIds.add(id);
              // Reinsert to show deleted styling (or to prevent actual delete when locked)
              next.splice(
                op.fromRowIndex + kept++,
                0,
                prev[op.fromRowIndex + i]
              );
            }
          });
        }
      }
      setValue(next);
    },
    [createdRowIds, deletedRowIds, updatedRowIds, lockRows]
  );

  const gridState = useMemo(
    () => ({
      isDirty:
        createdRowIds.size > 0 ||
        deletedRowIds.size > 0 ||
        updatedRowIds.size > 0 ||
        JSON.stringify(value) !== JSON.stringify(prevDataRef.current),
      createdRowIds,
      deletedRowIds,
      updatedRowIds,
    }),
    [value, createdRowIds, deletedRowIds, updatedRowIds]
  );

  const getValues = useCallback(
    (opts?: { includeDeleted?: boolean }) => {
      const includeDeleted = !!opts?.includeDeleted;
      if (includeDeleted) return value;
      return value.filter((row) => {
        const id = idOf(row);
        if (id == null) return true;
        return !deletedRowIds.has(id);
      });
    },
    [value, deletedRowIds]
  );

  const reset = useCallback(() => {
    setValue(prevDataRef.current);
    createdRowIds.clear();
    deletedRowIds.clear();
    updatedRowIds.clear();
  }, [createdRowIds, deletedRowIds, updatedRowIds]);

  const commit = useCallback(() => {
    const newData = value.filter((row) => {
      const id = idOf(row);
      return id == null || !deletedRowIds.has(id);
    });
    setValue(newData);
    prevDataRef.current = newData;
    createdRowIds.clear();
    deletedRowIds.clear();
    updatedRowIds.clear();
  }, [value, deletedRowIds, createdRowIds, updatedRowIds]);

  useEffect(() => {
    // Refresh baseline when initialData changes (e.g., new loader rows)
    prevDataRef.current = initialData || [];
    setValue(initialData || []);
    createdRowIds.clear();
    deletedRowIds.clear();
    updatedRowIds.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialData || [])]);

  const rowClassName = useCallback(
    ({ rowData }: { rowData: T }) => {
      const id = idOf(rowData);
      if (id == null) return undefined;
      if (deletedRowIds.has(id)) return "row-deleted";
      if (createdRowIds.has(id)) return "row-created";
      if (updatedRowIds.has(id)) return "row-updated";
      return undefined;
    },
    [createdRowIds, deletedRowIds, updatedRowIds]
  );

  return {
    value,
    setValue,
    onChange,
    gridState,
    getValues,
    reset,
    commit,
    rowClassName,
    createRow,
    duplicateRow,
  } as const;
}
