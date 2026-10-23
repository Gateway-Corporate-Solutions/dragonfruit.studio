import type { SiteDocument, SiteNode } from "./site.ts";
export const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
export const LAYER_CSS = String.raw`
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f8f7f2}h1,h2,p{margin:0;white-space:pre-line}a{white-space:pre-line}[hidden]{display:none!important}
.df-widget{--df-accent:#294c38;--df-panel:#fff;--df-ink:#243c30;color:var(--df-ink)}
.df-widget button,.df-widget input,.df-widget textarea{font:inherit}.df-widget button,.df-widget input,.df-widget textarea{border:1px solid #78916c;border-radius:6px;padding:10px 14px}.df-widget button{background:var(--df-accent);color:white;cursor:pointer}.df-widget button:disabled{opacity:.65;cursor:wait}.df-widget :focus-visible{outline:3px solid #668943;outline-offset:3px}
.df-form{display:grid;gap:18px}.df-form label{display:grid;gap:7px;font-size:11pt}.df-form input:not([type=checkbox]),.df-form textarea{width:100%;color:#243c30;background:#fff}.df-form .df-check{display:flex;align-items:center}.df-honeypot{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important}.df-form [data-form-status]{font-size:11pt;line-height:1.6}
.df-slide{padding:32px;background:var(--df-panel);border-radius:10px;min-height:190px}.df-slide h2{margin-bottom:14px}.df-slide p{line-height:1.7}.df-slide img{display:block;width:100%;height:220px;object-fit:cover;margin-bottom:22px;border-radius:8px}.df-carousel-controls{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:12px;margin-top:18px}.df-carousel-controls [role=status]{min-width:40px;text-align:center}
.df-accordion-item{background:var(--df-panel);border:1px solid #adbea2;border-radius:8px;margin-bottom:10px;overflow:hidden}.df-widget [data-accordion-toggle]{width:100%;text-align:left;background:transparent;color:inherit;border:0;padding:20px;font-weight:600}.df-widget [data-accordion-toggle]::after{content:'+';float:right}.df-widget [data-accordion-toggle][aria-expanded=true]::after{content:'−'}.df-accordion-panel{padding:0 20px 22px;line-height:1.8}
.df-navbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:20px}.df-nav-brand{font-size:20px;font-weight:700}.df-nav-links{display:flex;align-items:center;flex-wrap:wrap;gap:18px}.df-nav-links a{color:inherit;text-decoration:none;padding:8px}.df-navmenu .df-nav-links{flex-direction:column;align-items:stretch;width:100%}.df-nav-links a:hover{text-decoration:underline}.df-image-placeholder{min-height:180px;display:grid;place-items:center;background:#e9efdf;color:#4f6246;border:1px dashed #78916c}
@media(max-width:640px){.df-nav-links{width:100%;flex-direction:column;align-items:stretch}.df-slide{padding:22px}}
`;
export function pageMarkup(site: SiteDocument, pageId = "home"): string {
  const esc = escapeHtml;
  function render(n: SiteNode): string {
    const o = n.layer ?? {},
      style = esc(
        Object.entries(n.styles).map(([k, v]) => k + ":" + v + ";").join(""),
      );
    const attrs = ' id="' + n.id + '" data-node="' + n.id + '" style="' +
      style + '"';
    if (n.tag === "img") {
      return o.src
        ? "<img" + attrs + ' src="' + esc(o.src) + '" alt="' +
          esc(o.alt ?? "") + '" loading="lazy" decoding="async"/>'
        : "<div" + attrs +
          ' class="df-image-placeholder">Choose an image in the inspector</div>';
    }
    if (n.tag === "form") {
      const fields = (o.fields ?? []).map((f) => {
        const id = n.id + "-" + f.name,
          a = ' id="' + id + '" name="' + f.name + '"' +
            (f.required ? " required" : "");
        return "<label" + (f.type === "checkbox" ? ' class="df-check"' : "") +
          ' for="' + id + '">' + (f.type === "checkbox"
            ? '<input type="checkbox"' + a + ' value="true"/>'
            : "") +
          esc(f.label) + (f.type === "textarea"
            ? "<textarea" + a + ' rows="4" maxlength="6000"></textarea>'
            : f.type === "checkbox"
            ? ""
            : '<input type="' + f.type + '"' + a + ' maxlength="6000"/>') +
          "</label>";
      }).join("");
      return "<form" + attrs +
        ' class="df-widget df-form" aria-label="' +
        esc(n.text || "Contact form") + '" data-df-form action="/api/forms/' +
        pageId +
        "/" + n.id + '" method="post" data-success="' +
        esc(o.successMessage ?? "Thank you!") + '"><h2>' +
        esc(n.text || "Get in touch") + "</h2>" + fields +
        '<div class="df-honeypot" aria-hidden="true"><label>Leave empty<input name="__df_hp" tabindex="-1" autocomplete="off"/></label></div><button type="submit">' +
        esc(o.submitLabel ?? "Send message") +
        '</button><p data-form-status role="status" aria-live="polite"></p></form>';
    }
    if (["carousel", "accordion", "nav", "navmenu"].includes(n.tag)) {
      const data = ' class="df-widget ' + (n.tag === "carousel"
        ? "df-carousel"
        : n.tag === "accordion"
        ? "df-accordion"
        : "df-navbar " + (n.tag === "navmenu" ? "df-navmenu" : "")) +
        '" data-df-widget="' + n.tag + '" data-options="' +
        esc(JSON.stringify(o)) + '"';
      const items = o.items ?? [];
      if (n.tag === "carousel") {
        return "<section" + attrs + data +
          ' role="region" aria-roledescription="carousel" aria-label="' +
          esc(n.text || "Highlights") + '" tabindex="0">' +
          items.map((i, index) =>
            '<article class="df-slide" data-slide role="group" aria-roledescription="slide" aria-label="' +
            (index + 1) + " of " + items.length + '"' +
            (index ? " hidden" : "") + ">" + (i.image
              ? '<img src="' + esc(i.image) + '" alt="' + esc(i.title) + '"/>'
              : "") +
            "<h2>" + esc(i.title) + "</h2><p>" + esc(i.body) + "</p>" +
            (i.href !== "#"
              ? '<a href="' + esc(i.href) + '">Learn more</a>'
              : "") +
            "</article>"
          ).join("") +
          '<div class="df-carousel-controls"><button type="button" data-prev aria-label="Previous slide">←</button><span data-carousel-status role="status" aria-live="' +
          (o.autoplay ? "off" : "polite") + '">1 / ' + items.length +
          '</span><button type="button" data-next aria-label="Next slide">→</button>' +
          (o.autoplay
            ? '<button type="button" data-pause>Pause slides</button>'
            : "") +
          "</div></section>";
      }
      if (n.tag === "accordion") {
        return "<section" + attrs + data + ' aria-label="' +
          esc(n.text || "Questions and answers") + '">' +
          items.map((i, index) => {
            const id = n.id + "-panel-" + index,
              button = n.id + "-toggle-" + index;
            return '<div class="df-accordion-item"><h2><button type="button" data-accordion-toggle id="' +
              button + '" aria-label="' + esc(i.title) + '" aria-controls="' +
              id + '" aria-expanded="false">' +
              esc(i.title) +
              '</button></h2><div class="df-accordion-panel" id="' + id +
              '" role="region" aria-labelledby="' + button + '" hidden>' +
              esc(i.body) + "</div></div>";
          }).join("") + "</section>";
      }
      return "<nav" + attrs + data + ' aria-label="' +
        esc(n.text || "Website navigation") + '"><span class="df-nav-brand">' +
        esc(n.text || "Your website") +
        '</span><button type="button" data-menu-toggle aria-expanded="true" aria-controls="' +
        n.id + '-menu">Menu</button><div class="df-nav-links" data-menu id="' +
        n.id + '-menu">' + items.map((i) =>
          '<a href="' + esc(i.href) + '">' + esc(i.title) + "</a>"
        ).join("") + n.children.map(render).join("") + "</div></nav>";
    }
    return "<" + n.tag + attrs + (n.href ? ' href="' + esc(n.href) + '"' : "") +
      (o.newTab ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" +
      esc(n.text) + n.children.map(render).join("") + "</" + n.tag + ">";
  }
  return site.nodes.map(render).join("");
}
