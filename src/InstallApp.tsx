import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Download, Smartphone } from "lucide-react";
import { Modal, Button } from "./ui";
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
interface InstallState {
  installed: boolean;
  install: () => Promise<void>;
  pending: boolean;
}
const InstallContext = createContext<InstallState | null>(null);
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
export function InstallProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(isStandalone),
    [pending, setPending] = useState(false),
    [help, setHelp] = useState(false);
  const prompt = useRef<InstallPromptEvent | null>(null);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      prompt.current = event as InstallPromptEvent;
    };
    const completed = () => {
      prompt.current = null;
      setInstalled(true);
      setHelp(false);
    };
    const media = window.matchMedia("(display-mode: standalone)");
    const modeChanged = () => {
      if (isStandalone()) completed();
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", completed);
    media.addEventListener("change", modeChanged);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", completed);
      media.removeEventListener("change", modeChanged);
    };
  }, []);
  async function install() {
    if (installed || pending) return;
    const event = prompt.current;
    if (!event) {
      setHelp(true);
      return;
    }
    setPending(true);
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      setHelp(true);
    } finally {
      prompt.current = null;
      setPending(false);
    }
  }
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  return (
    <InstallContext.Provider value={{ installed, install, pending }}>
      {children}
      {help && (
        <Modal title="HeimFriseur installieren" onClose={() => setHelp(false)}>
          <div className="install-help">
            <span className="round-icon">
              <Smartphone size={24} />
            </span>
            <p>
              Öffne HeimFriseur direkt über ein eigenes Symbol auf deinem
              Startbildschirm.
            </p>
          </div>
          {ios ? (
            <ol className="install-steps">
              <li>
                Öffne diese Website in <strong>Safari</strong>.
              </li>
              <li>
                Tippe auf <strong>Teilen</strong>.
              </li>
              <li>
                Wähle <strong>Zum Home-Bildschirm</strong> und anschließend{" "}
                <strong>Hinzufügen</strong>.
              </li>
            </ol>
          ) : android ? (
            <ol className="install-steps">
              <li>
                Öffne diese Website in <strong>Chrome</strong>.
              </li>
              <li>
                Tippe oben rechts auf das Menü <strong>⋮</strong>.
              </li>
              <li>
                Wähle <strong>App installieren</strong> oder{" "}
                <strong>Zum Startbildschirm hinzufügen</strong>.
              </li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li>
                Öffne diese Website in <strong>Chrome</strong> oder{" "}
                <strong>Edge</strong>.
              </li>
              <li>
                Klicke auf das Installationssymbol in der Adressleiste oder
                öffne das Browser-Menü.
              </li>
              <li>
                Wähle <strong>HeimFriseur installieren</strong> beziehungsweise{" "}
                <strong>Apps → Diese Website als App installieren</strong>.
              </li>
            </ol>
          )}
          <p className="muted">
            Die Installation ist kostenlos. Zum Laden und Speichern deiner
            Kundendaten benötigst du eine Internetverbindung.
          </p>
          <Button onClick={() => setHelp(false)}>Verstanden</Button>
        </Modal>
      )}
    </InstallContext.Provider>
  );
}
export function InstallAppButton() {
  const context = useContext(InstallContext);
  if (!context || context.installed) return null;
  return (
    <button
      type="button"
      className="button secondary install-button"
      aria-label="App installieren"
      title="HeimFriseur installieren"
      disabled={context.pending}
      onClick={() => void context.install()}
    >
      <Download size={18} />
      <span className="install-label">
        {context.pending ? "Bitte warten …" : "App installieren"}
      </span>
    </button>
  );
}
