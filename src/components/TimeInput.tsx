import { useEffect, useState } from "react";
import { time, parse } from "../utils/time";
export function TimeInput({
  label,
  value,
  onChange,
  onFocus,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onFocus?: () => void;
}) {
  const [text, setText] = useState(time(value));
  useEffect(() => setText(time(value)), [value]);
  return (
    <label className="time-field">
      <span>{label}</span>
      <input
        aria-label={label}
        value={text}
        onFocus={onFocus}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = parse(text);
          if (Number.isFinite(n)) onChange(n);
          else setText(time(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
