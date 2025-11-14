import React, { forwardRef, useRef } from "react";
import { TextInput } from "@mantine/core";
import type { TextInputProps } from "@mantine/core";

export type EmbeddedTextInputProps = Omit<TextInputProps, "styles"> & {
  /** Text alignment inside the input */
  align?: "left" | "center" | "right";
  /** Padding applied to the input element */
  padding?: number | string;
  /** Stretch input to fill the cell width */
  fullWidth?: boolean;
  /** Extra inline styles to merge into the input element */
  inputStyle?: React.CSSProperties;
  /** Optional Mantine styles override object */
  styles?: any;
};

/**
 * EmbeddedTextInput
 * A TextInput optimized for embedding inside table cells.
 * - Unstyled variant by default
 * - Full-width, centered text, compact padding
 */
export const EmbeddedTextInput = forwardRef<
  HTMLInputElement,
  EmbeddedTextInputProps
>(
  (
    {
      align = "center",
      padding = 8,
      fullWidth = true,
      inputStyle,
      styles,
      variant = "unstyled",
      ...rest
    },
    ref
  ) => {
    const innerRef = useRef<HTMLInputElement | null>(null);

    // Merge forwarded ref with our inner ref
    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref && typeof ref === "object") (ref as any).current = node;
    };

    const handleFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
      // Allow user onFocus first
      (rest as any)?.onFocus?.(e);
      // For numeric inputs: if current value is 0, display blank to ease overwrite
      const isNumeric = (rest as any)?.type === "number";
      if (isNumeric && innerRef.current) {
        const curr = innerRef.current.value;
        const numeric = Number(curr);
        if (curr === "0" || numeric === 0) {
          // Do not notify parent; only adjust displayed value
          innerRef.current.value = "";
        }
      }
    };

    const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
      const isNumeric = (rest as any)?.type === "number";
      if (isNumeric && innerRef.current) {
        const curr = innerRef.current.value;
        if (curr === "" || curr == null) {
          // If left blank, coerce to 0 and notify parent via onChange shape
          if ((rest as any)?.onChange) {
            const synthetic: any = {
              target: { value: "0" },
              currentTarget: { value: "0" },
            };
            (rest as any).onChange(synthetic);
          } else {
            innerRef.current.value = "0";
          }
        }
      }
      // Call user onBlur last
      (rest as any)?.onBlur?.(e);
    };

    const mergedStyles = {
      input: {
        width: fullWidth ? "100%" : undefined,
        textAlign: align as any,
        padding,
        ...inputStyle,
        ...(styles && styles.input ? styles.input : {}),
      },
      ...(styles || {}),
    } as any;

    return (
      <TextInput
        ref={setRefs}
        variant={variant as any}
        styles={mergedStyles}
        onFocus={handleFocus}
        onBlur={handleBlur}
        {...rest}
      />
    );
  }
);

export default EmbeddedTextInput;
