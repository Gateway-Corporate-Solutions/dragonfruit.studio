type Change = (property: string, value: string) => void;
export function LengthControl(
  { label, value, onChange }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
  },
) {
  const match = value.match(/^(-?\d+(?:\.\d+)?)(px|rem|em|%|vh|vw)?$/);
  const unit = match?.[2] ?? "px";
  return (
    <div class="length-control">
      <input
        aria-label={label}
        type="number"
        step="any"
        value={match?.[1] ?? ""}
        placeholder={value ? "Auto" : "Default"}
        title={value && !match
          ? "Custom / responsive value — edit in CSS"
          : undefined}
        onInput={(e) =>
          onChange(e.currentTarget.value ? e.currentTarget.value + unit : "")}
      />
      <select
        aria-label={label + " unit"}
        value={unit}
        onChange={(e) => onChange((match?.[1] ?? "0") + e.currentTarget.value)}
      >
        {["px", "rem", "em", "%", "vh", "vw"].map((u) => (
          <option value={u} key={u}>{u}</option>
        ))}
      </select>
    </div>
  );
}
export function StyleControl(
  { property, label, value, onChange }: {
    property: string;
    label: string;
    value: string;
    onChange: Change;
  },
) {
  return (
    <div class="style-field">
      <span>{label}</span>
      <div>
        {["color", "background"].includes(property)
          ? (
            <>
              <input
                class="color-swatch"
                aria-label={label + " picker"}
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff"}
                onInput={(e) => onChange(property, e.currentTarget.value)}
              />
              <input
                aria-label={label}
                value={value}
                placeholder="Default"
                onInput={(e) => onChange(property, e.currentTarget.value)}
              />
            </>
          )
          : property === "font-weight"
          ? (
            <select
              aria-label={label}
              value={value}
              onChange={(e) => onChange(property, e.currentTarget.value)}
            >
              <option value="">Default</option>
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semibold</option>
              <option value="700">Bold</option>
              <option value="800">Extra bold</option>
              {value && !["400", "500", "600", "700", "800"].includes(value) &&
                <option value={value}>Custom</option>}
            </select>
          )
          : property === "line-height"
          ? (
            <input
              aria-label={label}
              type="number"
              min="0"
              step="0.1"
              value={/^\d*\.?\d+$/.test(value) ? value : ""}
              placeholder={value ? "Custom" : "Auto"}
              onInput={(e) => onChange(property, e.currentTarget.value)}
            />
          )
          : (
            <LengthControl
              label={label}
              value={value}
              onChange={(v) => onChange(property, v)}
            />
          )}
      </div>
    </div>
  );
}
export function BoxSpacing(
  { property, styles, onChange }: {
    property: "padding" | "margin";
    styles: Record<string, string>;
    onChange: Change;
  },
) {
  const sides = ["top", "right", "bottom", "left"];
  const values: Record<string, string> = {};
  // Respect declaration order when raw CSS mixes shorthand and longhand.
  for (const [key, value] of Object.entries(styles)) {
    if (key === property) {
      const parts = value.trim().split(/\s+/);
      for (let i = 0; i < 4; i++) {
        values[sides[i]] = parts[i] ?? parts[i % 2] ?? parts[0];
      }
    } else if (key.startsWith(property + "-")) {
      values[key.slice(property.length + 1)] = value;
    }
  }
  return (
    <fieldset class="spacing-controls">
      <legend>
        {property === "padding" ? "Inner spacing" : "Outer spacing"}
      </legend>
      <div>
        {sides.map((side) => (
          <label key={side}>
            {side}
            <LengthControl
              label={property + " " + side}
              value={values[side] ?? ""}
              onChange={(v) => onChange(property + "-" + side, v)}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
