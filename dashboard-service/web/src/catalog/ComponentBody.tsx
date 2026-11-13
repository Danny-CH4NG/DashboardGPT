import type { ComponentSpec } from "./envelope.ts";
import { dataValidator } from "./_shared/define.ts";
import { catalog } from "./index.ts";

/** Renders the inner content of a component; validates first so a bad spec never crashes the page. */
export function ComponentBody({ spec, large }: { spec: ComponentSpec; large?: boolean }) {
  const entry = catalog[spec.type];
  if (!entry) return <div className="render-error">這個版本的 dashboard 不認得元件類型「{spec.type}」</div>;
  const data = dataValidator(entry.def).safeParse(spec.data);
  const options = entry.def.options.safeParse(spec.options ?? {});
  if (!data.success || !options.success) {
    const issues = [...(data.success ? [] : data.error.issues), ...(options.success ? [] : options.error.issues)];
    return (
      <div className="render-error">
        資料格式不符（{entry.def.label}）
        <ul>
          {issues.slice(0, 3).map((i, k) => (
            <li key={k}>
              {i.path.join(".") || "data"}：{i.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const { Renderer } = entry;
  return <Renderer data={data.data as never} options={options.data as never} large={large} />;
}
