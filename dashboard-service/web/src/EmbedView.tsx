import { useCallback } from "react";
import { api, useLive } from "./api.ts";
import { ComponentFrame } from "./components/ComponentFrame.tsx";

/** Renders one component full-size for iframes (e.g. the chat service's preview). */
export function EmbedView({ kind, id }: { kind: "preview" | "component"; id: string }) {
  const load = useCallback(() => (kind === "preview" ? api.draft(id).then((d) => d.spec) : api.component(id)), [kind, id]);
  const { value, error } = useLive(load);
  if (error) return <div className="fatal">預覽無法載入</div>;
  if (!value) return <div className="fatal">載入中…</div>;
  return (
    <div className="embed">
      <ComponentFrame spec={value} fill />
    </div>
  );
}
