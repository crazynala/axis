import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type MouseEvent,
} from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconSearch } from "@tabler/icons-react";

type SkuLookupCellProps = {
  value: string;
  focus?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onPaste?: (value: string) => void;
  showLookup?: boolean;
  onLookup?: () => void;
  onBlur?: () => void;
  readOnly?: boolean;
};

export function SkuLookupCell({
  value,
  focus,
  disabled,
  onChange,
  onPaste,
  showLookup = false,
  onLookup,
  onBlur,
  readOnly = false,
}: SkuLookupCellProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLInputElement>) => {
      if (!onPaste) return;
      const text = event.clipboardData.getData("text");
      if (text) onPaste(text);
    },
    [onPaste]
  );

  const handleLookupClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onLookup?.();
    },
    [onLookup]
  );

  useEffect(() => {
    if (focus && !disabled && !readOnly) {
      inputRef.current?.focus();
    } else if (!focus && inputRef.current) {
      inputRef.current.blur();
    }
  }, [focus, disabled, readOnly]);

  if (readOnly) {
    return <div style={{ width: "100%", height: "100%" }} />;
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        onBlur={onBlur}
        style={{
          width: "100%",
          border: "none",
          outline: "none",
          background: "transparent",
          paddingRight: focus && showLookup ? 28 : 4,
        }}
      />
      {focus && showLookup && (
        <Tooltip label="Search products" withinPortal>
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            style={{ position: "absolute", top: 2, right: 2 }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleLookupClick}
          >
            <IconSearch size={14} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
