import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field } from "./ui";
export function PasswordInput({
  label = "Passwort",
  name = "password",
  newPassword = false,
}: {
  label?: string;
  name?: string;
  newPassword?: boolean;
}) {
  const [visible, setVisible] = useState(false),
    [last, setLast] = useState("");
  const previous = useRef(""),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Field label={label + " *"}>
      <div className="password-field">
        <input
          aria-label={label + " *"}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={newPassword ? "new-password" : "current-password"}
          required
          minLength={6}
          onChange={(e) => {
            clearTimeout(timer.current);
            const value = e.target.value;
            const native = e.nativeEvent as InputEvent;
            setLast(
              native.inputType === "insertText" &&
                value.length === previous.current.length + 1
                ? value.slice(-1)
                : "",
            );
            previous.current = value;
            timer.current = setTimeout(() => setLast(""), 800);
          }}
          onBlur={() => {
            clearTimeout(timer.current);
            setLast("");
          }}
        />
        {!visible && last && (
          <span className="password-recent" aria-hidden="true">
            {last}
          </span>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label={visible ? "Passwort verbergen" : "Passwort anzeigen"}
          onClick={() => {
            setVisible(!visible);
            setLast("");
          }}
        >
          {visible ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </div>
    </Field>
  );
}
