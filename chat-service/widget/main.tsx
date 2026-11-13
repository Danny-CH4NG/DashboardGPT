/// <reference types="vite/client" />
import { createRoot, type Root } from "react-dom/client";
import css from "./styles.css?inline";
import { Widget } from "./Widget.tsx";

const FONTS = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600&display=swap";

/** <dashboard-chat>: floats over the host page (fixed position) without touching its layout. Shadow DOM keeps styles apart. */
class DashboardChat extends HTMLElement {
  private root?: Root;
  connectedCallback() {
    if (this.root) return;
    // @font-face does not work inside shadow roots, so fonts go on the document.
    if (!document.querySelector(`link[href="${FONTS}"]`)) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = FONTS;
      document.head.appendChild(l);
    }
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = css;
    const mount = document.createElement("div");
    mount.className = "dc-root";
    shadow.append(style, mount);
    this.root = createRoot(mount);
    this.root.render(<Widget />);
  }
  disconnectedCallback() {
    this.root?.unmount();
    this.root = undefined;
  }
}

if (!customElements.get("dashboard-chat")) customElements.define("dashboard-chat", DashboardChat);
