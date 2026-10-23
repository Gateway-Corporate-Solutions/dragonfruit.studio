import { type CommerceConfig, parseCommerce } from "./commerce.ts";
import { parseSeo, type Seo } from "./seo.ts";
import { type ApiConnection, parseConnections } from "./forms.ts";
import { ValidationError } from "./manifest.ts";
import {
  changeNode,
  freshSource,
  parseSite,
  type SiteDocument,
  type SiteNode,
  starterSite,
} from "./site.ts";

export interface SitePage extends SiteDocument {
  id: string;
  name: string;
  path: string;
  article?: boolean;
  seo?: Seo;
}
export interface WebsiteDocument {
  schemaVersion: 2;
  title: string;
  pages: SitePage[];
  apis?: ApiConnection[];
  commerce?: CommerceConfig;
}
export const PAGE_TEMPLATES = [
  {
    id: "home",
    name: "Home",
    description: "A welcoming landing page",
    icon: "⌂",
  },
  {
    id: "about",
    name: "About",
    description: "Your story, values, and team",
    icon: "◎",
  },
  {
    id: "services",
    name: "Services",
    description: "Show what you can do",
    icon: "✳",
  },
  {
    id: "contact",
    name: "Contact",
    description: "Start a conversation",
    icon: "↗",
  },
  {
    id: "pricing",
    name: "Pricing",
    description: "Plans and clear next steps",
    icon: "◈",
  },
  {
    id: "faq",
    name: "FAQ",
    description: "Answers to common questions",
    icon: "?",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    description: "A collection of your work",
    icon: "▦",
  },
  {
    id: "blog",
    name: "Blog",
    description: "Updates and recent stories",
    icon: "≋",
  },
  {
    id: "blank",
    name: "Blank",
    description: "A clean page to make your own",
    icon: "+",
  },
] as const;
export type PageTemplate = typeof PAGE_TEMPLATES[number]["id"];
const fail = (message: string): never => {
  throw new ValidationError([message]);
};
export function parseWebsite(value: unknown): WebsiteDocument {
  if (!value || typeof value !== "object") {
    return fail("Website must be an object");
  }
  const input = value as Record<string, unknown>;
  // Lossless upgrade of existing single-page drafts. No SQL rewrite is necessary.
  if (input.schemaVersion === 1) {
    const page = parseSite(input);
    return {
      schemaVersion: 2,
      title: page.title,
      pages: [{ ...page, id: "home", name: "Home", path: "/" }],
    };
  }
  if (
    input.schemaVersion !== 2 || typeof input.title !== "string" ||
    !input.title.trim() || input.title.length > 120 ||
    !Array.isArray(input.pages) || !input.pages.length ||
    input.pages.length > 16
  ) return fail("Website requires a title and 1–16 pages");
  const ids = new Set<string>(), paths = new Set<string>();
  const pages = input.pages.map((item): SitePage => {
    if (!item || typeof item !== "object") return fail("Invalid page");
    const p = item as Record<string, unknown>;
    if (
      typeof p.id !== "string" || !/^[a-z][a-z0-9-]{0,70}$/.test(p.id) ||
      ids.has(p.id)
    ) return fail("Page IDs must be unique");
    if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 60) {
      return fail("Page names must contain 1–60 characters");
    }
    if (
      typeof p.path !== "string" || p.path.length > 160 ||
      !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/.test(
        p.path,
      ) || paths.has(p.path) || p.path.split("/").includes("index") ||
      p.path === "/api" || p.path.startsWith("/api/")
    ) {
      return fail(
        "Page URLs must be unique lowercase paths, such as /about or /company/team; api and index are reserved",
      );
    }
    ids.add(p.id);
    paths.add(p.path);
    return {
      ...parseSite(p),
      id: p.id,
      name: p.name.trim(),
      path: p.path,
      ...(p.article === true ? { article: true } : {}),
      ...(p.seo !== undefined ? { seo: parseSeo(p.seo) } : {}),
    };
  });
  if (!paths.has("/")) return fail("Keep one Home page at /");
  const apis = parseConnections(input.apis);
  const commerce = parseCommerce(input.commerce);
  const articles = pages.filter((p) => p.article);
  for (const page of pages) {
    const sync = (nodes: SiteNode[]): void => {
      for (const n of nodes) {
        if (n.tag === "blog") {
          n.layer = {
            ...n.layer,
            items: articles.map((p) => ({
              title: p.name,
              body: p.seo?.description || "Read the full article.",
              href: p.path,
              image: p.seo?.image || "",
            })),
          };
        }
        sync(n.children);
      }
    };
    sync(page.nodes);
  }
  for (const page of pages) {
    const visit = (nodes: SiteNode[]) => {
      for (const n of nodes) {
        if (
          n.tag === "form" && n.layer?.apiId &&
          !apis.some((a) => a.id === n.layer!.apiId)
        ) fail("A form references a missing API connection");
        visit(n.children);
      }
    };
    visit(page.nodes);
  }
  return {
    schemaVersion: 2,
    title: input.title.trim(),
    pages,
    ...(apis.length ? { apis } : {}),
    ...(commerce ? { commerce } : {}),
  };
}
export function starterWebsite(name: string): WebsiteDocument {
  return {
    schemaVersion: 2,
    title: name,
    pages: [{ ...starterSite(name), id: "home", name: "Home", path: "/" }],
  };
}
const heading: Record<PageTemplate, [string, string, string]> = {
  home: [
    "WELCOME",
    "Something great\nstarts here.",
    "A space for your story, your work, and whatever comes next.",
  ],
  about: [
    "OUR STORY",
    "Good work starts\nwith good people.",
    "Meet the people and ideas behind what we do.",
  ],
  services: [
    "WHAT WE DO",
    "Thoughtful solutions.\nLasting results.",
    "From the first conversation to the final detail, we help you move forward.",
  ],
  contact: [
    "LET'S TALK",
    "A conversation can\nchange everything.",
    "Have a question or a new idea? We would love to hear from you.",
  ],
  pricing: [
    "SIMPLE PRICING",
    "The right fit\nfor your next chapter.",
    "Choose a starting point. Make room for what comes next.",
  ],
  faq: [
    "A LITTLE CLARITY",
    "Good questions.\nStraight answers.",
    "Everything you might want to know before getting started.",
  ],
  portfolio: [
    "SELECTED WORK",
    "Ideas made real.",
    "A few things we have helped bring into the world.",
  ],
  blog: [
    "THE JOURNAL",
    "Notes along the way.",
    "Ideas, stories, and lessons from the work we do.",
  ],
  blank: ["", "", ""],
};
const cards: Partial<Record<PageTemplate, [string, string][]>> = {
  about: [[
    "Our beginning",
    "Every great project starts with a small idea. This is where our story began.",
  ], [
    "What we believe",
    "Care, curiosity, and thoughtful work guide everything we make.",
  ], [
    "Our people",
    "A small team, different perspectives, and a shared commitment to doing things well.",
  ]],
  services: [[
    "Strategy",
    "Find the right direction with a clear plan and a fresh perspective.",
  ], [
    "Design",
    "Turn your ideas into experiences that are useful, considered, and memorable.",
  ], [
    "Delivery",
    "Bring everything together with thoughtful execution and ongoing support.",
  ]],
  contact: [["Email us", "Tell us a little about what you have in mind."], [
    "Visit us",
    "Add your address and opening hours here.",
  ], [
    "Work with us",
    "A project, a partnership, or simply a good question — start here.",
  ]],
  pricing: [[
    "Starter · $19 / month",
    "For new ideas. Your essential features, a simple setup, and room to get started.",
  ], [
    "Studio · $49 / month",
    "For growing teams. More flexibility, extra tools, and priority support.",
  ], [
    "Custom · Let's talk",
    "For something different. A plan shaped around the way you work.",
  ]],
  faq: [[
    "How do we get started?",
    "Reach out with a little about your idea. We will help you find the next step.",
  ], [
    "How long does a project take?",
    "Every project is different. We agree on a clear scope and timeline together.",
  ], [
    "Can I make changes later?",
    "Absolutely. Your website can grow and change as your needs evolve.",
  ], [
    "Where can I ask another question?",
    "Visit our Contact page. We are always happy to help.",
  ]],
  portfolio: [[
    "Project One",
    "A new identity for a bright idea. Replace this with the story behind your work.",
  ], [
    "Project Two",
    "A useful experience, thoughtfully made. Share the challenge and the result.",
  ], [
    "Project Three",
    "Something worth sharing. Add the details that make this project yours.",
  ]],
  blog: [[
    "Making space for better ideas",
    "An introduction to the way we think, create, and work together.",
  ], [
    "The details that make a difference",
    "A few small observations from our latest projects.",
  ], [
    "What comes next",
    "New work, new questions, and a look at the road ahead.",
  ]],
};
export function templatePage(
  template: PageTemplate,
  websiteName: string,
  name: string,
  path: string,
  id = "page-" + crypto.randomUUID().slice(0, 8),
): SitePage {
  let document = starterSite(websiteName);
  document.title = name + " · " + websiteName;
  if (template === "blank") {
    document.nodes = document.nodes.filter((n) => n.id === "navigation");
  } else {
    const [eyebrow, title, description] = heading[template];
    for (
      const [nodeId, text] of [["eyebrow", eyebrow], ["hero-title", title], [
        "hero-description",
        description,
      ]]
    ) document = changeNode(document, nodeId, (n) => ({ ...n, text }));
    if (template !== "home") {
      document.nodes[1].children = document.nodes[1].children.filter((n) =>
        n.id !== "hero-button"
      );
    }
    const entries = cards[template];
    if (entries) {
      const children: SiteNode[] = entries.map((
        [title, text],
        index,
      ): SiteNode => ({
        id: "card-" + index,
        tag: "div",
        text: "",
        styles: {
          padding: "28px",
          background: "#ffffff",
          "border-radius": "12px",
        },
        children: [
          {
            id: "card-title-" + index,
            tag: "h2",
            text: title,
            styles: {
              "font-size": "23px",
              color: "#243c30",
              "margin-bottom": "14px",
            },
            children: [],
          },
          {
            id: "card-text-" + index,
            tag: "p",
            text,
            styles: {
              "font-size": "16px",
              color: "#65735a",
              "line-height": "1.8",
            },
            children: [],
          },
        ],
      }));
      if (template === "contact") {
        children[0].children.push({
          id: "contact-email",
          tag: "a",
          text: "hello@example.com ↗",
          href: "mailto:hello@example.com",
          styles: {
            display: "inline-block",
            color: "#294c38",
            "margin-top": "16px",
          },
          children: [],
        });
      }
      document.nodes.splice(2, 0, {
        id: "page-content",
        tag: "section",
        text: "",
        styles: {
          display: "grid",
          "grid-template-columns":
            "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
          gap: "24px",
          padding: "48px 6%",
          background: "#f8f7f2",
        },
        children,
      });
    }
  }
  return { ...document, id, name, path };
}
export function uniquePagePath(website: WebsiteDocument, name: string): string {
  const slug =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(
      0,
      50,
    ).replace(/-$/, "") || "page";
  let path = "/" + (["api", "index"].includes(slug) ? "page-" + slug : slug),
    n = 2;
  while (website.pages.some((p) => p.path === path)) {
    path = "/" + slug + "-" + n++;
  }
  return path;
}
export function syncNavigation(website: WebsiteDocument): WebsiteDocument {
  return {
    ...website,
    pages: website.pages.map((page) => {
      const nav = page.nodes.find((n) => n.id === "navigation");
      if (!nav) return page; // A deliberately removed header stays removed.
      const existing = nav.children.find((n) => n.id === "page-links");
      const links: SiteNode = {
        id: "page-links",
        tag: "div",
        text: "",
        styles: existing?.styles ??
          {
            display: "flex",
            gap: "18px",
            "flex-wrap": "wrap",
            "justify-content": "center",
          },
        children: website.pages.filter((p) => !p.article).map((target) => {
          const previous = existing?.children.find((n) =>
            n.id === "nav-" + target.id
          );
          return {
            id: "nav-" + target.id,
            tag: "a",
            text: target.name,
            href: target.path,
            styles: previous?.styles ??
              {
                color: "#45623d",
                "font-size": "11pt",
                "text-decoration": "none",
              },
            children: [],
          };
        }),
      };
      return changeNode(
        page,
        "navigation",
        (n) => ({
          ...n,
          styles: {
            ...n.styles,
            gap: n.styles.gap ?? "20px",
            "flex-wrap": n.styles["flex-wrap"] ?? "wrap",
          },
          children: [...n.children.filter((c) => c.id !== "page-links"), links],
        }),
      ) as SitePage;
    }),
  };
}
export function addPage(
  website: WebsiteDocument,
  template: PageTemplate,
  name: string,
): WebsiteDocument {
  if (website.pages.length >= 16) {
    return fail("A website supports up to 16 pages");
  }
  if (!PAGE_TEMPLATES.some((t) => t.id === template)) {
    return fail("Choose a page template");
  }
  const next = {
    ...website,
    pages: [
      ...website.pages,
      templatePage(
        template,
        website.title,
        name,
        uniquePagePath(website, name),
      ),
    ],
  };
  if (template === "blog") {
    const page = next.pages[next.pages.length - 1];
    page.nodes = page.nodes.filter((n) => n.id !== "page-content");
    page.nodes.push({
      id: "blog-articles",
      tag: "blog",
      text: "Articles",
      styles: { padding: "48px 6%" },
      children: [],
      layer: { items: [] },
    });
    return addBlogArticle(next, "Making space for better ideas", page.path);
  }
  return parseWebsite(syncNavigation(next));
}
export function updatePageDetails(
  website: WebsiteDocument,
  id: string,
  name: string,
  path: string,
): WebsiteDocument {
  const old = website.pages.find((p) => p.id === id);
  if (!old) return fail("Page not found");
  if (old.path === "/" && path !== "/") {
    return fail("The Home page must keep the / URL");
  }
  const visit = (nodes: SiteNode[]): SiteNode[] =>
    nodes.map((n) => ({
      ...n,
      ...(n.href === old.path ? { href: path } : {}),
      ...(n.layer?.items
        ? {
          layer: {
            ...n.layer,
            items: n.layer.items.map((i) =>
              i.href === old.path ? { ...i, href: path } : i
            ),
          },
        }
        : {}),
      children: visit(n.children),
    }));
  const pages = website.pages.map((p) => ({
    ...p,
    ...(p.id === id ? { name, path } : {}),
    nodes: visit(p.nodes),
  }));
  return parseWebsite(syncNavigation({ ...website, pages }));
}
export function deletePage(
  website: WebsiteDocument,
  id: string,
): WebsiteDocument {
  const page = website.pages.find((p) => p.id === id);
  if (!page || page.path === "/") {
    return fail("The Home page cannot be deleted");
  }
  const visit = (nodes: SiteNode[]): SiteNode[] =>
    nodes.map((n) => ({
      ...n,
      ...(n.href === page.path ? { href: "/" } : {}),
      ...(n.layer?.items
        ? {
          layer: {
            ...n.layer,
            items: n.layer.items.map((i) =>
              i.href === page.path ? { ...i, href: "/" } : i
            ),
          },
        }
        : {}),
      children: visit(n.children),
    }));
  return parseWebsite(
    syncNavigation({
      ...website,
      pages: website.pages.filter((p) => p.id !== id).map((p) => ({
        ...p,
        nodes: visit(p.nodes),
      })),
    }),
  );
}
export function routeFilename(path: string): string {
  return path === "/" ? "index.tsx" : path.slice(1) + ".tsx";
}
export function websiteSourceFiles(
  website: WebsiteDocument,
): { name: string; content: string }[] {
  return website.pages.map((page) => ({
    name: "routes/" + routeFilename(page.path),
    content: freshSource(page, page.id),
  }));
}

/** Articles are real pages, sharing the editor, history, persistence and export pipeline. */
export function addBlogArticle(
  website: WebsiteDocument,
  title = "New article",
  base = "/blog",
): WebsiteDocument {
  if (website.pages.length >= 16) {
    return fail("A website supports up to 16 pages");
  }
  const slug = uniquePagePath(website, title).slice(1);
  let path = base + "/" + slug, n = 2;
  while (website.pages.some((p) => p.path === path)) {
    path = base + "/" + slug + "-" + n++;
  }
  const page = templatePage("blank", website.title, title, path);
  page.article = true;
  page.seo = {
    description:
      "A fresh perspective on thoughtful work, better ideas, and what comes next.",
    image: "",
    noindex: false,
  };
  page.nodes.push({
    id: "article-content",
    tag: "markdown",
    text: "",
    styles: { padding: "48px 6%", "max-width": "850px", margin: "0 auto" },
    children: [],
    layer: {
      markdown: "# " + title +
        "\n\nEvery good idea needs room to grow. This journal is a place to share what we are learning.\n\n## Start with a question\n\nWhat could we make simpler, clearer, or more useful?\n\n- Listen closely.\n- Try something small.\n- Share what you learn.\n\n> Thoughtful work starts with curiosity.\n\n[Back to the journal](" +
        base + ")",
    },
  });
  return parseWebsite(
    syncNavigation({ ...website, pages: [...website.pages, page] }),
  );
}

/** Refresh derived index cards without validating intermediate editor text or mutating history. */
export function refreshBlogIndex(website: WebsiteDocument): WebsiteDocument {
  const items = website.pages.filter((p) => p.article).map((p) => ({
    title: p.name,
    body: p.seo?.description || "Read the full article.",
    href: p.path,
    image: p.seo?.image || "",
  }));
  const visit = (nodes: SiteNode[]): SiteNode[] =>
    nodes.map((n) => ({
      ...n,
      ...(n.tag === "blog" ? { layer: { ...n.layer, items } } : {}),
      children: visit(n.children),
    }));
  return {
    ...website,
    pages: website.pages.map((p) => ({ ...p, nodes: visit(p.nodes) })),
  };
}
