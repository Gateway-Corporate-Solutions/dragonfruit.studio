import { fontCss, fontsForStack, WEB_FONTS } from "@/src/domain/fonts.ts";
export default function FontPicker(
  { value, weight, onChange }: {
    value: string;
    weight?: string;
    onChange: (key: string, value: string) => void;
  },
) {
  const system = [["system-ui, sans-serif", "System sans-serif"], [
    'Georgia, "Times New Roman", serif',
    "System serif",
  ], ['ui-monospace, "Courier New", monospace', "System monospace"]];
  const known = !value || system.some(([stack]) => stack === value) ||
    WEB_FONTS.some((font) => font.stack === value);
  const selected = fontsForStack(value)[0];
  const css = fontCss([{
    id: "font-sample",
    tag: "p",
    text: "",
    styles: { "font-family": value },
    children: [],
  }], true);
  return (
    <section class="font-picker">
      {css && <style>{css}</style>}
      <label>
        Font family<select
          aria-label="Font family"
          value={value}
          onChange={(e) => onChange("font-family", e.currentTarget.value)}
        >
          <option value="">Inherit from parent</option>
          <optgroup label="System fonts">
            {system.map(([stack, name]) => (
              <option key={stack} value={stack}>{name}</option>
            ))}
          </optgroup>
          {[
            "Sans serif",
            "Serif",
            "Display",
            "Monospace",
            "Handwritten & script",
          ].map((group) => (
            <optgroup key={group} label={group}>
              {WEB_FONTS.filter((font) => font.group === group).map((font) => (
                <option key={font.id} value={font.stack}>{font.name}</option>
              ))}
            </optgroup>
          ))}
          {!known && <option value={value}>Custom font stack</option>}
        </select>
      </label>
      <p
        class="font-picker-sample"
        style={{ fontFamily: value || "inherit", fontWeight: weight || "400" }}
      >
        The quick brown fox<br />Aa Bb Cc · 0123456789
      </p>
      {selected && (
        <p class="inspector-help">
          {selected.description}. Free to use, with font files included in your
          exports.
        </p>
      )}
      <details>
        <summary>Expert · Font stack</summary>
        <label>
          Font family CSS<input
            value={value}
            placeholder='"Inter", sans-serif'
            onChange={(e) => onChange("font-family", e.currentTarget.value)}
          />
        </label>
        <p class="inspector-help">
          Use a custom font stack here or in the CSS tab. Included fonts load
          automatically when named in the stack.
        </p>
      </details>
    </section>
  );
}
