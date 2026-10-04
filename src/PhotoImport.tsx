import { useEffect, useRef, useState } from "react";
import { Button, Input, Modal, Field } from "./ui";
import { parseCustomerForm } from "./photoParsing";
export function PhotoImport({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (v: Record<string, string>) => void;
}) {
  const [photo, setPhoto] = useState(""),
    [rotation, setRotation] = useState(0),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [values, setValues] = useState<Record<string, string>>({}),
    [text, setText] = useState("");
  const worker = useRef<import("tesseract.js").Worker | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      void worker.current?.terminate();
    };
  }, []);
  async function recognise() {
    if (!photo) return;
    setBusy(true);
    setStatus("Texterkennung wird geladen …");
    try {
      const image = new Image();
      image.src = photo;
      await image.decode();
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 2200 / Math.max(image.width, image.height));
      const w = Math.round(image.width * scale),
        h = Math.round(image.height * scale);
      const turned = rotation % 180 !== 0;
      canvas.width = turned ? h : w;
      canvas.height = turned ? w : h;
      const context = canvas.getContext("2d")!;
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(image, -w / 2, -h / 2, w, h);
      const { createWorker, OEM } = await import("tesseract.js");
      worker.current = await createWorker("deu", OEM.LSTM_ONLY, {
        workerPath: "/ocr/worker.min.js",
        corePath: "/ocr",
        langPath: "/ocr",
        workerBlobURL: false,
        logger: (m) => {
          if (active.current && m.status === "recognizing text")
            setStatus(
              "Text wird erkannt … " + Math.round(m.progress * 100) + " %",
            );
        },
      });
      if (!active.current) {
        await worker.current.terminate();
        worker.current = null;
        return;
      }
      const output = await worker.current.recognize(canvas);
      if (active.current) {
        setText(output.data.text);
        setValues(parseCustomerForm(output.data.text));
        setStatus(
          "Bitte alle Angaben prüfen. Handschrift und angekreuzte Kästchen können falsch erkannt werden.",
        );
      }
    } catch {
      if (active.current)
        setStatus(
          "Das Foto konnte nicht gelesen werden. Bitte ein schärferes Foto wählen oder die Angaben unten selbst eintragen.",
        );
    } finally {
      await worker.current?.terminate();
      worker.current = null;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Modal
      title="Kundenangaben aus Foto"
      onClose={() => {
        void worker.current?.terminate();
        onClose();
      }}
    >
      <p>
        Foto aufnehmen oder auswählen. Die Erkennung läuft auf deinem Gerät; das
        Foto wird nicht an Supabase oder einen KI-Dienst geschickt und nicht
        dauerhaft gespeichert.
      </p>
      <Field label="Foto des Formulars">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 20 * 1024 * 1024) {
              setStatus("Bitte ein Foto unter 20 MB verwenden.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              setPhoto(String(reader.result));
              setText("");
              setValues({});
              setRotation(0);
            };
            reader.readAsDataURL(file);
          }}
        />
      </Field>
      {photo && (
        <>
          <img
            className="photo-preview"
            alt="Ausgewähltes Formular, nur lokal"
            src={photo}
            style={{ transform: `rotate(${rotation}deg)` }}
          />
          <div className="button-group">
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => setRotation((rotation + 90) % 360)}
            >
              Foto drehen
            </Button>
            <Button disabled={busy} onClick={() => void recognise()}>
              Angaben erkennen
            </Button>
          </div>
        </>
      )}
      <p role="status" className="muted">
        {status || "Du kannst erkannte Angaben vor der Übernahme korrigieren."}
      </p>
      <div className="form-grid">
        {[
          ["first_name", "Vorname"],
          ["last_name", "Nachname"],
          ["room_number", "Zimmer- / Raumnummer"],
        ].map(([key, label]) => (
          <Input
            key={key}
            label={label}
            value={values[key] || ""}
            onChange={(v) => setValues({ ...values, [key]: v })}
          />
        ))}
      </div>
      <Field label="Friseur gewünscht? Bitte ausdrücklich prüfen">
        <select
          value={values.hair_request || "Unbekannt"}
          onChange={(e) =>
            setValues({ ...values, hair_request: e.target.value })
          }
        >
          <option>Unbekannt</option>
          <option>Ja</option>
          <option>Nein</option>
        </select>
      </Field>
      {text && (
        <details>
          <summary>Erkannten Text zur Kontrolle ansehen</summary>
          <pre className="ocr-text">{text}</pre>
        </details>
      )}
      <Button disabled={busy} onClick={() => onApply(values)}>
        Geprüfte Angaben ins Formular übernehmen
      </Button>
      <p className="muted">
        Erst „Speichern“ im Kundenformular legt einen Kunden an. Unterschriften
        und Einwilligungstexte werden nicht übernommen.
      </p>
    </Modal>
  );
}
