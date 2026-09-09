import type { InputHTMLAttributes, ReactNode } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode };

export function FormField({ label, hint, ...inputProps }: Props) {
  return <div className="field"><label htmlFor={inputProps.id}>{label} {hint && <span>{hint}</span>}</label><input {...inputProps}/></div>;
}
