/// <reference types="vite/client" />
import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "@fontsource/orbitron/500.css";
import "@fontsource/orbitron/700.css";
import "@fontsource/rajdhani/500.css";
import "@fontsource/rajdhani/600.css";
import "./theme.css";
import { App } from "./App.tsx";
import { EmbedView } from "./EmbedView.tsx";

const m = location.pathname.match(/^\/embed\/(preview|component)\/([^/]+)/);
createRoot(document.getElementById("root")!).render(m ? <EmbedView kind={m[1] as "preview" | "component"} id={m[2]} /> : <App />);
