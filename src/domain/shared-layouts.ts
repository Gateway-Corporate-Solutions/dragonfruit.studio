import { allNodes, changeNode, parseSite, type SiteNode } from "./site.ts";
import type { WebsiteDocument } from "./website.ts";
import { ValidationError } from "./manifest.ts";

export interface SharedLayout {
  id: string;
  name: string;
  node: SiteNode;
}
const safeId = /^[a-zA-Z][a-zA-Z0-9_-]{0,70}$/;
const fail = (message: string): never => {
  throw new ValidationError([message]);
};
const walk = (nodes: SiteNode[]): SiteNode[] =>
  nodes.flatMap((n) => [n, ...walk(n.children)]);
const strip = (node: SiteNode): SiteNode => {
  const { sharedLayoutId: _layout, sharedNodeId: _source, ...rest } = node;
  return { ...rest, children: node.children.map(strip) };
};
const title = (name: string) => {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 60) {
    fail("Name your shared layout using 1–60 characters");
  }
  return name.trim();
};
export function parseSharedLayouts(value: unknown): SharedLayout[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 24) {
    return fail("Use up to 24 shared layouts per website");
  }
  const ids = new Set<string>();
  return value.map((item) => {
    if (
      !item || typeof item !== "object" || typeof item.id !== "string" ||
      !safeId.test(item.id) || ids.has(item.id)
    ) return fail("Shared layouts need unique safe IDs");
    ids.add(item.id);
    const node = parseSite({
      schemaVersion: 1,
      title: "Shared layout",
      nodes: [item.node],
    }).nodes[0];
    if (!["section", "div"].includes(node.tag)) {
      return fail("Only Groups and Sections can be shared layouts");
    }
    if (walk([node]).some((n) => n.sharedLayoutId || n.sharedNodeId)) {
      return fail("Shared layout definitions cannot contain linked instances");
    }
    return { id: item.id, name: title(item.name), node };
  });
}
export function validateSharedInstances(
  nodes: SiteNode[],
  layouts: SharedLayout[],
): void {
  const visit = (node: SiteNode, owner?: string, keys = new Set<string>()) => {
    if (node.sharedLayoutId) {
      if (owner) {
        fail(
          "Shared layouts cannot be nested. Insert an independent copy instead",
        );
      }
      if (!layouts.some((l) => l.id === node.sharedLayoutId)) {
        fail("An element references a missing shared layout");
      }
      owner = node.sharedLayoutId;
      keys = new Set();
    }
    if (node.sharedNodeId) {
      if (!owner || keys.has(node.sharedNodeId)) {
        fail("Invalid shared layout node reference");
      }
      keys.add(node.sharedNodeId);
    }
    node.children.forEach((n) => visit(n, owner, keys));
  };
  nodes.forEach((n) => visit(n));
}
export function sharedOwner(
  nodes: SiteNode[],
  nodeId: string,
): SiteNode | undefined {
  for (const node of nodes) {
    if (node.sharedLayoutId && walk([node]).some((n) => n.id === nodeId)) {
      return node;
    }
    const nested = sharedOwner(node.children, nodeId);
    if (nested) return nested;
  }
}
/** Rewrite only local anchors belonging to this subtree; external links stay intact. */
function remap(
  node: SiteNode,
  ids: Map<string, string>,
  mapNode: (n: SiteNode) => SiteNode,
): SiteNode {
  const href = (s: string) =>
    s.startsWith("#") && ids.has(s.slice(1)) ? "#" + ids.get(s.slice(1)) : s;
  const next = mapNode(node);
  return {
    ...next,
    ...(node.href ? { href: href(node.href) } : {}),
    ...(node.layer?.items
      ? {
        layer: {
          ...node.layer,
          items: node.layer.items.map((i) => ({ ...i, href: href(i.href) })),
        },
      }
      : {}),
    children: node.children.map((n) => remap(n, ids, mapNode)),
  };
}
function capture(instance: SiteNode): SiteNode {
  const ids = new Map(
    walk([instance]).map((n) => [n.id, n.sharedNodeId ?? n.id]),
  );
  return strip(remap(instance, ids, (n) => ({ ...n, id: ids.get(n.id)! })));
}
function instantiate(
  layout: SharedLayout,
  existing: SiteNode | undefined,
  taken: Set<string>,
  linked = true,
): SiteNode {
  const previous = new Map(
    walk(existing ? [existing] : []).map((n) => [n.sharedNodeId ?? n.id, n.id]),
  );
  const ids = new Map<string, string>();
  for (const n of walk([layout.node])) {
    let id = n === layout.node && existing ? existing.id : previous.get(n.id);
    if (!id) {
      do {
        id = "element-" + crypto.randomUUID().slice(0, 12);
      } while (taken.has(id));
    }
    taken.add(id);
    ids.set(n.id, id);
  }
  const node = remap(
    layout.node,
    ids,
    (n) => ({
      ...n,
      id: ids.get(n.id)!,
      ...(linked ? { sharedNodeId: n.id } : {}),
    }),
  );
  return linked ? { ...node, sharedLayoutId: layout.id } : node;
}
/** First capture edited instances, then fan out atomically, keeping each copy's IDs stable. */
export function synchronizeSharedLayouts(
  next: WebsiteDocument,
  previous?: WebsiteDocument,
  preferredPageId?: string,
): WebsiteDocument {
  if (!next.sharedLayouts?.length) return next;
  const pages = [...next.pages].sort((a, b) =>
    Number(b.id === preferredPageId) - Number(a.id === preferredPageId)
  );
  const layouts = next.sharedLayouts.map((layout) => {
    if (!previous?.sharedLayouts?.some((l) => l.id === layout.id)) {
      return layout;
    }
    for (const page of pages) {
      const old = previous.pages.find((p) => p.id === page.id);
      for (
        const n of walk(page.nodes).filter((n) =>
          n.sharedLayoutId === layout.id
        )
      ) {
        const before = old &&
          walk(old.nodes).find((v) =>
            v.id === n.id && v.sharedLayoutId === layout.id
          );
        if (before && JSON.stringify(before) !== JSON.stringify(n)) {
          return { ...layout, node: capture(n) };
        }
      }
    }
    return layout;
  });
  return {
    ...next,
    sharedLayouts: layouts,
    pages: next.pages.map((page) => {
      const taken = new Set(walk(page.nodes).map((n) => n.id));
      const visit = (n: SiteNode): SiteNode => {
        if (n.sharedLayoutId) {
          const layout = layouts.find((l) => l.id === n.sharedLayoutId);
          if (!layout) return fail("Shared layout not found");
          return instantiate(layout, n, taken);
        }
        return { ...n, children: n.children.map(visit) };
      };
      return { ...page, nodes: page.nodes.map(visit) };
    }),
  };
}
export function saveSharedLayout(
  website: WebsiteDocument,
  pageId: string,
  nodeId: string,
  name: string,
): WebsiteDocument {
  const page = website.pages.find((p) => p.id === pageId),
    node = page && allNodes(page).find((n) => n.id === nodeId);
  if (!page || !node || !["section", "div"].includes(node.tag)) {
    return fail("Select a Group or Section to share");
  }
  if (
    sharedOwner(page.nodes, nodeId) ||
    walk([node]).some((n) => n.sharedLayoutId)
  ) return fail("Detach existing shared layouts before sharing this container");
  if ((website.sharedLayouts?.length ?? 0) >= 24) {
    return fail("Use up to 24 shared layouts per website");
  }
  const id = "layout-" + crypto.randomUUID().slice(0, 12),
    layout = { id, name: title(name), node: strip(node) };
  const mark = (n: SiteNode): SiteNode => ({
    ...n,
    sharedNodeId: n.id,
    children: n.children.map(mark),
  });
  return {
    ...website,
    sharedLayouts: [...website.sharedLayouts ?? [], layout],
    pages: website.pages.map((p) =>
      p.id === pageId
        ? {
          ...p,
          ...changeNode(p, nodeId, (n) => ({ ...mark(n), sharedLayoutId: id })),
        }
        : p
    ),
  };
}
export function insertSharedLayout(
  website: WebsiteDocument,
  pageId: string,
  layoutId: string,
  linked = true,
): { website: WebsiteDocument; nodeId: string } {
  const layout = website.sharedLayouts?.find((l) => l.id === layoutId),
    page = website.pages.find((p) => p.id === pageId);
  if (!layout || !page) return fail("Shared layout or page not found");
  const node = instantiate(
    layout,
    undefined,
    new Set(allNodes(page).map((n) => n.id)),
    linked,
  );
  // Insertion is deliberately at page level; this prevents hidden recursive layouts.
  return {
    website: {
      ...website,
      pages: website.pages.map((p) =>
        p.id === pageId ? { ...p, nodes: [...p.nodes, node] } : p
      ),
    },
    nodeId: node.id,
  };
}
export function detachSharedLayout(
  website: WebsiteDocument,
  pageId: string,
  nodeId: string,
): WebsiteDocument {
  return {
    ...website,
    pages: website.pages.map((p) =>
      p.id === pageId ? { ...p, ...changeNode(p, nodeId, strip) } : p
    ),
  };
}
export function renameSharedLayout(
  website: WebsiteDocument,
  id: string,
  name: string,
): WebsiteDocument {
  if (!website.sharedLayouts?.some((l) => l.id === id)) {
    return fail("Shared layout not found");
  }
  return {
    ...website,
    sharedLayouts: website.sharedLayouts.map((l) =>
      l.id === id ? { ...l, name: title(name) } : l
    ),
  };
}
export function removeSharedLayout(
  website: WebsiteDocument,
  id: string,
): WebsiteDocument {
  const visit = (n: SiteNode): SiteNode =>
    n.sharedLayoutId === id
      ? strip(n)
      : { ...n, children: n.children.map(visit) };
  return {
    ...website,
    sharedLayouts: website.sharedLayouts?.filter((l) => l.id !== id),
    pages: website.pages.map((p) => ({ ...p, nodes: p.nodes.map(visit) })),
  };
}
