import { ValidationError } from "./manifest.ts";
import { safeImage } from "./layers.ts";
export const COMMERCE_TAGS = [
  "shop",
  "product",
  "cart",
  "checkout",
  "calendar",
  "schedule",
];
export interface Product {
  id: string;
  name: string;
  description: string;
  amount: number;
  image: string;
  active: boolean;
}
export interface ScheduleSlot {
  id: string;
  title: string;
  start: string;
  end: string;
  bookingUrl: string;
}
export interface CommerceConfig {
  currency: "usd" | "eur" | "gbp";
  provider: "preview" | "stripe";
  products: Product[];
  slots: ScheduleSlot[];
  businessEmail?: string;
}
export const defaultCommerce = (): CommerceConfig => ({
  currency: "usd",
  provider: "preview",
  products: [],
  slots: [],
});
export function parseCommerce(value: unknown): CommerceConfig | undefined {
  if (value === undefined) return;
  const fail = (): never => {
    throw new ValidationError([
      "Invalid commerce configuration. Use unique IDs, whole minor-unit prices, and valid booking URLs and dates.",
    ]);
  };
  if (!value || typeof value !== "object") return fail();
  const c = value as CommerceConfig;
  if (
    !["usd", "eur", "gbp"].includes(c.currency) ||
    !["preview", "stripe"].includes(c.provider) || !Array.isArray(c.products) ||
    c.products.length > 100 || !Array.isArray(c.slots) || c.slots.length > 100
  ) return fail();
  if (
    c.businessEmail !== undefined &&
    (typeof c.businessEmail !== "string" || c.businessEmail.length > 254 ||
      (c.businessEmail !== "" &&
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.businessEmail)))
  ) return fail();
  const ids = new Set<string>();
  const id = (s: string) => {
    if (
      typeof s !== "string" || !/^[a-z][a-z0-9-]{0,70}$/.test(s) || ids.has(s)
    ) fail();
    ids.add(s);
  };
  const text = (s: string, max: number) =>
    typeof s === "string" && s.length <= max;
  const products = c.products.map((p) => {
    if (!p) return fail();
    id(p.id);
    if (
      !text(p.name, 200) || !p.name.trim() || !text(p.description, 3000) ||
      !Number.isSafeInteger(p.amount) || p.amount < 50 || p.amount > 99999999 ||
      typeof p.image !== "string" || !safeImage(p.image) ||
      typeof p.active !== "boolean"
    ) return fail();
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      amount: p.amount,
      image: p.image,
      active: p.active,
    };
  });
  ids.clear();
  const slots = c.slots.map((s) => {
    if (!s) return fail();
    id(s.id);
    if (
      !text(s.title, 200) || !s.title.trim() || !text(s.start, 40) ||
      !text(s.end, 40) || !/Z$|[+-]\d\d:\d\d$/.test(s.start) ||
      !/Z$|[+-]\d\d:\d\d$/.test(s.end) ||
      !Number.isFinite(Date.parse(s.start)) ||
      !(Date.parse(s.end) > Date.parse(s.start)) || !text(s.bookingUrl, 2000) ||
      (s.bookingUrl !== "" && !/^https:\/\/[^\s<>"'\\]+$/.test(s.bookingUrl))
    ) return fail();
    return {
      id: s.id,
      title: s.title,
      start: s.start,
      end: s.end,
      bookingUrl: s.bookingUrl,
    };
  });
  return {
    currency: c.currency,
    provider: c.provider,
    products,
    slots,
    ...(c.businessEmail !== undefined
      ? { businessEmail: c.businessEmail }
      : {}),
  };
}
