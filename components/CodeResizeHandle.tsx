interface Props {
  orientation: "horizontal" | "vertical";
  label: string;
  controls: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  fromPointer: (event: PointerEvent) => number;
}

export default function CodeResizeHandle(props: Props) {
  const change = (value: number) =>
    props.onChange(Math.max(props.min, Math.min(props.max, value)));
  const release = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };
  return (
    <div
      class={`code-resize-handle ${props.orientation}`}
      role="separator"
      tabIndex={0}
      aria-label={props.label}
      aria-controls={props.controls}
      aria-orientation={props.orientation}
      aria-valuemin={props.min}
      aria-valuemax={props.max}
      aria-valuenow={Math.round(props.value)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          change(props.fromPointer(event));
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(event) => {
        const previous = props.orientation === "horizontal"
          ? "ArrowUp"
          : "ArrowLeft";
        const next = props.orientation === "horizontal"
          ? "ArrowDown"
          : "ArrowRight";
        if (![previous, next, "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        change(
          event.key === "Home"
            ? props.min
            : event.key === "End"
            ? props.max
            : props.value + (event.key === previous ? -5 : 5),
        );
      }}
    />
  );
}
