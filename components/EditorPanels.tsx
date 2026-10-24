import type { ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";

export default function EditorPanels(
  { pages, children }: {
    pages: ComponentChildren;
    children: ComponentChildren;
  },
) {
  const container = useRef<HTMLElement>(null);
  const [split, setSplit] = useState(40);
  const change = (value: number) => setSplit(Math.max(15, Math.min(85, value)));
  const release = (event: PointerEvent) => {
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };
  return (
    <aside
      ref={container}
      class="editor-left"
      style={`--pages-share:${split}%`}
    >
      <section id="editor-pages" class="editor-pages-pane" aria-label="Pages">
        {pages}
      </section>
      <div
        class="navigation-resize-handle"
        role="separator"
        tabIndex={0}
        aria-label="Resize Pages and page elements panels"
        aria-controls="editor-pages editor-elements"
        aria-orientation="horizontal"
        aria-valuemin={15}
        aria-valuemax={85}
        aria-valuenow={Math.round(split)}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const bounds = container.current?.getBoundingClientRect();
          if (bounds) {
            change((event.clientY - bounds.top) / bounds.height * 100);
          }
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={(event) => {
          if (
            !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
          ) return;
          event.preventDefault();
          change(
            event.key === "Home"
              ? 15
              : event.key === "End"
              ? 85
              : split + (event.key === "ArrowUp" ? -5 : 5),
          );
        }}
      />
      <section
        id="editor-elements"
        class="editor-elements-pane"
        aria-label="Page elements"
      >
        {children}
      </section>
    </aside>
  );
}
