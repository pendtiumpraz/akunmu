import type { ComponentProps, InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

const CONTROL_BASE =
  "rounded-lg border bg-surface px-3 text-sm text-ink outline-none transition placeholder:text-faint focus:border-accent focus:ring-4 focus:ring-accent-soft disabled:bg-subtle disabled:text-faint";
const CONTROL = `w-full ${CONTROL_BASE}`;

function controlState(invalid?: boolean) {
  return invalid ? "border-danger focus:border-danger focus:ring-danger-soft" : "border-line";
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  optionalLabel,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-baseline gap-1 text-[13px] font-semibold leading-[18px] text-ink-2">
        <span>{label}</span>
        {required ? <span className="text-danger">*</span> : null}
        {!required && optionalLabel ? <span className="font-normal text-faint">({optionalLabel})</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-danger-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ invalid, className, ...rest }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={cn(CONTROL, "h-9", controlState(invalid), className)} {...rest} />;
}

export function Textarea({ invalid, className, ...rest }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(CONTROL, "min-h-20 py-2", controlState(invalid), className)}
      {...rest}
    />
  );
}

/** `fullWidth={false}` sizes the select to its content (toolbar filters). */
export function Select({
  invalid,
  fullWidth = true,
  className,
  children,
  ...rest
}: ComponentProps<"select"> & { invalid?: boolean; fullWidth?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(fullWidth ? CONTROL : CONTROL_BASE, "h-9 pr-8", controlState(invalid), className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 text-sm", rest.disabled && "cursor-not-allowed opacity-70", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 cursor-pointer rounded accent-primary" {...rest} />
      <span className="space-y-0.5">
        <span className="block font-medium text-ink">{label}</span>
        {description ? <span className="block text-[13px] leading-5 text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {description ? <p className="text-[13px] leading-5 text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-primary" : "bg-line-strong",
        )}
      >
        <span
          className={cn("inline-block size-5 rounded-full bg-surface shadow-card transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")}
        />
      </button>
    </div>
  );
}

/** A row of mutually exclusive choices (filters, view switches). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode; icon?: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg border border-line bg-subtle p-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-[13px] font-semibold transition-colors",
              active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
