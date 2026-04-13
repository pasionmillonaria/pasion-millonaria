"use client";

import React from "react";

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> {
  value: string | number;
  onChange: (raw: string) => void;
}

function formatDisplay(value: string | number): string {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  if (isNaN(num) || num === 0) return "";
  return num.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

export default function InputDinero({ value, onChange, className, placeholder, ...props }: Props) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    onChange(raw);
  }

  const formattedPlaceholder =
    placeholder && /^\d+$/.test(placeholder)
      ? parseInt(placeholder, 10).toLocaleString("es-CO", { maximumFractionDigits: 0 })
      : placeholder;

  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      value={formatDisplay(value)}
      onChange={handleChange}
      placeholder={formattedPlaceholder}
      className={className}
    />
  );
}
