"use client";
import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "type"
> & { value: number | string | null };
const initial = (value: Props["value"]) =>
  value == null || value === "" || Number(value) === 0 ? "" : String(value);

// Keep the user's draft (including a deliberately entered zero) while the parent
// stores numeric values. A prefilled zero starts empty and never prefixes input.
export default function NumberInput({
  value,
  onChange,
  onFocus,
  placeholder = "Zahl eingeben",
  ...props
}: Props) {
  const [previous, setPrevious] = useState(value);
  const [draft, setDraft] = useState(() => initial(value));
  if (value !== previous || (draft !== "" && Number(draft) !== Number(value))) {
    setPrevious(value);
    if (Number(draft) !== Number(value) || (value == null && draft !== ""))
      setDraft(initial(value));
  }
  return (
    <input
      {...props}
      type="number"
      value={draft}
      placeholder={placeholder}
      inputMode={
        props.inputMode || (props.step === "0.01" ? "decimal" : "numeric")
      }
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange?.(e);
      }}
    />
  );
}
