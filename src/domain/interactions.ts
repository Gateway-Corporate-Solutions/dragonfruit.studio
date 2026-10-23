/** These are the actual editable function bodies used in preview and exported websites. */
export const INTERACTION_SCRIPTS: Record<string, string> = {
  carousel: String
    .raw`const slides = [...element.querySelectorAll('[data-slide]')];
const status = element.querySelector('[data-carousel-status]');
const pause = element.querySelector('[data-pause]');
let current = 0, timer, paused = !options.autoplay, hovering = false;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const show = (index) => {
  current = (index + slides.length) % slides.length;
  slides.forEach((slide, i) => { slide.hidden = i !== current; });
  if (status) status.textContent = (current + 1) + ' / ' + slides.length;
  api.animate(slides[current], options);
};
const schedule = () => {
  clearInterval(timer);
  if (!paused && !hovering && !reduced.matches && !document.hidden && !element.contains(document.activeElement))
    timer = setInterval(() => show(current + 1), options.interval);
  if (pause) pause.textContent = paused ? 'Play slides' : 'Pause slides';
};
api.on(element.querySelector('[data-prev]'), 'click', () => { show(current - 1); schedule(); });
api.on(element.querySelector('[data-next]'), 'click', () => { show(current + 1); schedule(); });
api.on(pause, 'click', () => { paused = !paused; schedule(); });
api.on(element, 'keydown', event => {
  if (event.target.matches('input,textarea,select')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
api.on(element, 'mouseenter', () => { hovering = true; schedule(); });
api.on(element, 'mouseleave', () => { hovering = false; schedule(); });
api.on(element, 'focusin', () => { hovering = true; schedule(); });
api.on(element, 'focusout', event => { if (!element.contains(event.relatedTarget)) { hovering = false; schedule(); } });
api.on(document, 'visibilitychange', schedule);
api.on(reduced, 'change', schedule);
api.cleanup(() => clearInterval(timer));
show(0); schedule();`,
  accordion: String
    .raw`const buttons = [...element.querySelectorAll('[data-accordion-toggle]')];
const close = button => { button.setAttribute('aria-expanded', 'false'); element.querySelector('#' + button.getAttribute('aria-controls')).hidden = true; };
buttons.forEach(button => api.on(button, 'click', () => {
  const opening = button.getAttribute('aria-expanded') !== 'true';
  if (!options.multiple) buttons.forEach(close);
  const panel = element.querySelector('#' + button.getAttribute('aria-controls'));
  button.setAttribute('aria-expanded', String(opening)); panel.hidden = !opening;
  if (opening) api.animate(panel, options);
}));
api.on(element, 'keydown', event => {
  const index = buttons.indexOf(event.target); if (index < 0) return;
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
  if (event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
});`,
  nav: String.raw`const toggle = element.querySelector('[data-menu-toggle]');
const menu = element.querySelector('[data-menu]');
const mobile = matchMedia('(max-width: 640px)');
const collapsible = () => options.collapse === 'always' || mobile.matches;
const setOpen = open => {
  toggle.setAttribute('aria-expanded', String(open)); menu.hidden = !open;
  if (open) api.animate(menu, options);
};
const resize = () => { toggle.hidden = !collapsible(); setOpen(!collapsible()); };
api.on(toggle, 'click', () => setOpen(toggle.getAttribute('aria-expanded') !== 'true'));
api.on(element, 'keydown', event => { if (event.key === 'Escape' && collapsible()) { setOpen(false); toggle.focus(); } });
api.on(document, 'click', event => { if (collapsible() && !element.contains(event.target)) setOpen(false); });
api.on(menu, 'click', event => { if (event.target.closest('a') && collapsible()) setOpen(false); });
api.on(mobile, 'change', resize); resize();`,
};
export function defaultJavascript(tag: string): string {
  return INTERACTION_SCRIPTS[tag === "navmenu" ? "nav" : tag] ?? "";
}
export const RUNTIME_SOURCE = "const defaults = " +
  JSON.stringify(INTERACTION_SCRIPTS).replaceAll("<", "\\u003c") + ";\n" +
  String.raw`
export function mount(root, preview = false) {
  const cleanups = [], animations = new Set();
  cleanups.push(() => animations.forEach(animation => animation.cancel()));
  const api = {
    on(target, type, listener) { if (!target) return; target.addEventListener(type, listener); cleanups.push(() => target.removeEventListener(type, listener)); },
    cleanup(fn) { cleanups.push(fn); },
    animate(target, options) {
      if (!target || options.animation === 'none' || !options.duration || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const frames = options.animation === 'slide' ? [{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'translateY(0)'}] : [{opacity:0},{opacity:1}];
      const animation = target.animate(frames, {duration:options.duration,easing:'ease-out'});
      animations.add(animation);
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    }
  };
  root.querySelectorAll('[data-df-widget]').forEach(element => {
    const options = JSON.parse(element.getAttribute('data-options') || '{}');
    const kind = element.getAttribute('data-df-widget');
    try {
      const source = options.javascript === undefined ? defaults[kind === 'navmenu' ? 'nav' : kind] : options.javascript;
      if (source) {
        const dispose = new Function('element','options','api', source)(element, options, api);
        if (typeof dispose === 'function') cleanups.push(dispose);
      }
    } catch (error) {
      const message = document.createElement('p'); message.setAttribute('role','alert'); message.textContent = 'Interaction JavaScript failed: ' + error.message; element.append(message);
    }
  });
  root.querySelectorAll('form[data-df-form]').forEach(form => {
    let submitting = false;
    api.on(form, 'submit', async event => {
      event.preventDefault(); if (submitting || !form.reportValidity()) return;
      const status = form.querySelector('[data-form-status]'), button = form.querySelector('[type=submit]');
      const values = Object.fromEntries(new FormData(form).entries());
      form.querySelectorAll('input[type=checkbox]').forEach(input => values[input.name] = input.checked ? 'true' : '');
      if (preview) { status.textContent = 'Preview only — validation passed. No data was sent or saved.'; return; }
      submitting = true; button.disabled = true; status.textContent = 'Sending…';
      try {
        const response = await fetch(form.getAttribute('action'), {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not submit. Try again later.');
        status.textContent = result.preview ? 'Preview API — no data sent or saved.' : form.getAttribute('data-success');
        form.reset();
      } catch (error) { status.textContent = error.message; }
      finally { submitting = false; button.disabled = false; }
    });
  });
  return () => cleanups.reverse().forEach(fn => {try {fn();} catch {}});
}
`;
