import { forwardRef, useId } from "react";

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  htmlFor?: string;
  children: React.ReactNode;
}

export function Field({ label, required, hint, error, className = "", htmlFor, children }: FieldProps) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="ml-0.5 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, wrapperClassName, className = "", id, required, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const control = (
    <input
      ref={ref}
      id={inputId}
      required={required}
      aria-invalid={error ? true : undefined}
      className={`form-control ${className}`}
      {...rest}
    />
  );
  if (!label) return control;
  return (
    <Field label={label} required={required} hint={hint} error={error} className={wrapperClassName} htmlFor={inputId}>
      {control}
    </Field>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
  placeholder?: string;
  options: { value: string; label: string }[];
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, wrapperClassName, className = "", id, required, options, placeholder, ...rest },
  ref,
) {
  const auto = useId();
  const selectId = id ?? auto;
  const control = (
    <select
      ref={ref}
      id={selectId}
      required={required}
      aria-invalid={error ? true : undefined}
      className={`form-control ${className}`}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  if (!label) return control;
  return (
    <Field label={label} required={required} hint={hint} error={error} className={wrapperClassName} htmlFor={selectId}>
      {control}
    </Field>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
  wrapperClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, wrapperClassName, className = "", id, required, ...rest },
  ref,
) {
  const auto = useId();
  const tId = id ?? auto;
  const control = <textarea ref={ref} id={tId} required={required} className={`form-control ${className}`} {...rest} />;
  if (!label) return control;
  return (
    <Field label={label} required={required} hint={hint} className={wrapperClassName} htmlFor={tId}>
      {control}
    </Field>
  );
});
