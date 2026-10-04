const inviteToken = new URLSearchParams(location.search).get("invite");
if (inviteToken) {
  sessionStorage.setItem("heimfriseur-invite", inviteToken);
  history.replaceState(null, "", location.pathname + location.hash);
}
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { InstallProvider } from "./InstallApp";
import { StoreProvider } from "./store";
import "./styles.css";
createRoot(document.getElementById("root")!).render(
  <StoreProvider>
    <InstallProvider>
      <App />
    </InstallProvider>
  </StoreProvider>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
