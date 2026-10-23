import { ValidationError } from "./manifest.ts";
export type FieldType =
  | "text"
  | "email"
  | "textarea"
  | "tel"
  | "number"
  | "checkbox";
export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
}
export interface LayerItem {
  title: string;
  body: string;
  href: string;
  image: string;
}
export interface LayerOptions {
  markdown?: string;
  productId?: string;
  src?: string;
  alt?: string;
  newTab?: boolean;
  apiId?: string;
  fields?: FormField[];
  submitLabel?: string;
  successMessage?: string;
  items?: LayerItem[];
  animation?: "none" | "fade" | "slide";
  duration?: number;
  autoplay?: boolean;
  interval?: number;
  multiple?: boolean;
  collapse?: "mobile" | "always";
  javascript?: string;
}
const fail = (s: string): never => {
  throw new ValidationError([s]);
};
export const MAX_IMAGE_BYTES = 10_000_000;
const MAX_IMAGE_DATA_URL_LENGTH = 14 * 1024 * 1024;
export function safeLink(s: string): boolean {
  return s.length <= 500 && !/[\s<>"']/.test(s) &&
    /^(#|\/(?!\/)|https:\/\/|mailto:|tel:)/i.test(s);
}
export function safeImage(s: string): boolean {
  return s === "" ||
    s.length <= MAX_IMAGE_DATA_URL_LENGTH &&
      (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/=]+$/.test(s) ||
        s.length <= 2000 && /^https:\/\/[^\s<>"']+$/.test(s) ||
        s.length <= 500 && /^\/(?!\/)[^\s<>"']+$/.test(s));
}
const string = (v: unknown, d: string, max = 2000): string =>
  typeof v === "string" && v.length <= max
    ? v
    : typeof v === "undefined"
    ? d
    : fail("Invalid layer text");
export function parseLayer(
  tag: string,
  value: unknown,
): LayerOptions | undefined {
  if (
    value === undefined &&
    ![
      "img",
      "form",
      "carousel",
      "accordion",
      "nav",
      "navmenu",
      "markdown",
      "blog",
      "shop",
      "product",
      "cart",
      "checkout",
      "calendar",
      "schedule",
    ].includes(tag)
  ) return;
  const o = (value ?? {}) as Record<string, unknown>;
  if (!o || typeof o !== "object" || Array.isArray(o)) {
    return fail("Layer options must be an object");
  }
  const result: LayerOptions = {};
  if (tag === "markdown") {
    result.markdown = string(
      o.markdown,
      "# Your article\n\nStart writing in **Markdown**.",
      100000,
    );
  }
  if (tag === "product") result.productId = string(o.productId, "", 71);

  if (tag === "a") result.newTab = o.newTab === true;
  if (tag === "img") {
    result.src = string(o.src, "", MAX_IMAGE_DATA_URL_LENGTH);
    result.alt = string(o.alt, "Describe this image", 300);
    if (!safeImage(result.src)) {
      fail("Use an HTTPS image URL, local path, or uploaded PNG/JPEG/WebP/GIF");
    }
  }
  if (tag === "form") {
    result.apiId = string(o.apiId, "", 71);
    if (result.apiId && !/^[a-z][a-z0-9-]{0,70}$/.test(result.apiId)) {
      fail("Invalid form API connection");
    }
    result.submitLabel = string(o.submitLabel, "Send message", 100);
    result.successMessage = string(
      o.successMessage,
      "Thanks! Your message has been sent.",
      500,
    );
    const fields = o.fields ?? defaultFields();
    if (!Array.isArray(fields) || !fields.length || fields.length > 16) {
      fail("Forms require 1–16 fields");
    }
    const names = new Set<string>();
    result.fields = (fields as unknown[]).map((v) => {
      const f = v as FormField;
      if (
        !f || typeof f.name !== "string" ||
        !/^[a-z][a-z0-9_]{0,39}$/.test(f.name) ||
        ["__df_hp", "__proto__", "constructor", "prototype"].includes(f.name) ||
        names.has(f.name)
      ) return fail("Field names must be unique lowercase names");
      names.add(f.name);
      if (
        !["text", "email", "textarea", "tel", "number", "checkbox"].includes(
          f.type,
        )
      ) fail("Unsupported form field type");
      return {
        name: f.name,
        label: string(f.label, "", 120),
        type: f.type,
        required: f.required === true,
      };
    });
  }
  if (["carousel", "accordion", "nav", "navmenu", "blog"].includes(tag)) {
    const items = o.items ?? defaultItems(tag);
    if (
      !Array.isArray(items) || (tag !== "blog" && !items.length) ||
      items.length > (tag === "blog" ? 16 : 12)
    ) {
      fail("Use 1–12 slides, panels, or menu links");
    }
    result.items = (items as unknown[]).map((v) => {
      const i = v as LayerItem;
      if (!i || typeof i !== "object") return fail("Invalid layer item");
      const item = {
        title: string(i.title, "Item", 200),
        body: string(i.body, "", 3000),
        href: string(i.href, "#", 500),
        image: string(i.image, "", MAX_IMAGE_DATA_URL_LENGTH),
      };
      if (!safeLink(item.href) || !safeImage(item.image)) {
        fail("Invalid item link or image");
      }
      return item;
    });
    result.animation = o.animation === undefined
      ? "fade"
      : (["none", "fade", "slide"].includes(String(o.animation))
        ? o.animation as LayerOptions["animation"]
        : fail("Choose a valid animation"));
    const number = (v: unknown, d: number, min: number, max: number) =>
      v === undefined
        ? d
        : typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
        ? v
        : fail("Animation timing is out of range");
    result.duration = number(o.duration, 250, 0, 2000);
    result.interval = number(o.interval, 5000, 1500, 60000);
    result.autoplay = o.autoplay === true;
    result.multiple = o.multiple === true;
    result.collapse = o.collapse === "always" ? "always" : "mobile";
    if (o.javascript !== undefined) {
      result.javascript = string(o.javascript, "", 20000);
      try {
        new Function("element", "options", "api", result.javascript);
      } catch {
        fail("Interaction JavaScript has a syntax error");
      }
    }
  }
  return result;
}
export const defaultFields = (): FormField[] => [
  { name: "name", label: "Your name", type: "text", required: true },
  { name: "email", label: "Email address", type: "email", required: true },
  { name: "message", label: "Message", type: "textarea", required: true },
];
export function defaultItems(tag: string): LayerItem[] {
  return (tag === "carousel"
    ? ["A bright beginning", "Room to grow", "Your next chapter"]
    : tag === "accordion"
    ? ["How does it work?", "Can I make changes?", "How do I get started?"]
    : ["Home", "About", "Contact"]).map((title, i) => ({
      title,
      body: tag === "carousel"
        ? "Share a story, highlight your work, or introduce an idea."
        : "Add your answer here.",
      href: tag === "nav" || tag === "navmenu"
        ? ["/", "/about", "/contact"][i]
        : "#",
      image: "",
    }));
}
