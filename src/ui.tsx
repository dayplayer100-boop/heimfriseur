import {
  X,
  Plus,
  Search,
  Scissors,
  CheckCircle2,
  Clock,
  Building2,
  CalendarDays,
} from "lucide-react";
import type { ReactNode, FormEvent } from "react";
import { useStore } from "./store";
export function Button({
  children,
  onClick,
  variant = "",
  type = "button",
  disabled = false,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  const { busy } = useStore();
  return (
    <button
      type={type}
      className={`button ${variant} ${className}`}
      onClick={onClick}
      disabled={disabled || busy}
    >
      {children}
    </button>
  );
}
export function Title({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Scissors size={32} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Schließen"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Input({
  label,
  name,
  value,
  required = false,
  type = "text",
  min,
  step,
  inputMode,
  onChange,
}: {
  label: string;
  name?: string;
  value?: string | number;
  required?: boolean;
  type?: string;
  min?: number;
  step?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email" | "tel" | "url";
  onChange?: (value: string) => void;
}) {
  return (
    <Field label={label + (required ? " *" : "")}>
      <input
        name={name}
        type={type}
        defaultValue={onChange ? undefined : value}
        value={onChange ? value : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        required={required}
        min={min}
        step={step}
        inputMode={inputMode}
      />
    </Field>
  );
}
export function Status({ status }: { status: string }) {
  return (
    <span
      className={`status ${status === "Abgeschlossen" || status === "Erledigt" ? "done" : status === "In Bearbeitung" || status === "In Behandlung" ? "working" : status === "Nicht durchgeführt" || status === "Abgesagt" ? "skipped" : "planned"}`}
    >
      {status === "Abgeschlossen" || status === "Erledigt" ? (
        <CheckCircle2 size={14} />
      ) : (
        <Clock size={14} />
      )}{" "}
      {status}
    </span>
  );
}
export function SearchBox({
  value,
  onChange,
  placeholder = "Suchen …",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search">
      <Search size={19} />
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function PlusButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button onClick={onClick}>
      <Plus size={18} />
      {children}
    </Button>
  );
}
export const formObject = (e: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<
    string,
    string
  >;
export function Meta({
  type,
  children,
}: {
  type: "building" | "calendar" | "clock";
  children: ReactNode;
}) {
  const Icon =
    type === "building"
      ? Building2
      : type === "calendar"
        ? CalendarDays
        : Clock;
  return (
    <span className="meta">
      <Icon size={16} />
      {children}
    </span>
  );
}
