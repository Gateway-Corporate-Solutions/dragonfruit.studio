import { deepStrictEqual, equal, match, throws } from "node:assert/strict";
import { compilePage, markupTree } from "../../src/domain/codegen.ts";
import { projectSourceFiles } from "../../src/domain/export.ts";
import { addPage, starterWebsite } from "../../src/domain/website.ts";
import { parseLayer } from "../../src/domain/layers.ts";
Deno.test("export compiler produces semantic JSX and named sections with extracted option constants", () => {
  const site = starterWebsite("Studio");
  const page = site.pages[0];
  page.nodes.push({
    id: "questions",
    tag: "accordion",
    text: "Questions",
    layer: parseLayer("accordion", {}),
    styles: { padding: "24px" },
    children: [],
  });
  const compiled = compilePage(page, page.id);
  match(compiled.source, /function NavigationSection/);
  match(compiled.source, /export default function PageHome/);
  match(compiled.source, /className="df-page-home"/);
  match(compiled.source, /const QuestionsOptions = \{/);
  match(compiled.source, /data-options=\{JSON.stringify\(QuestionsOptions\)\}/);
  match(compiled.source, /aria-expanded="false"/);
  equal(compiled.source.includes("dangerouslySetInnerHTML"), false);
  equal(compiled.source.includes("const markup"), false);
  equal(compiled.source.includes("style="), false);
});
Deno.test("export IR decodes entities, preserves whitespace and rejects unbalanced markup", () => {
  deepStrictEqual(
    markupTree('<p title="A &amp; B">A &lt; B &amp; {value}\n<br/>Done</p>'),
    [{
      kind: "element",
      tag: "p",
      attributes: { title: "A & B" },
      children: [{ kind: "text", value: "A < B & {value}\n" }, {
        kind: "element",
        tag: "br",
        attributes: {},
        children: [],
      }, { kind: "text", value: "Done" }],
    }],
  );
  throws(() => markupTree("<div><p></div>"));
  throws(() => markupTree("<div>"));
  const page = starterWebsite("Studio").pages[0];
  page.nodes = [{
    id: "special",
    tag: "p",
    text: '<script>{user} & "quotes"\nnew line',
    styles: {},
    children: [],
  }];
  const source = compilePage(page).source;
  match(source, /\\u003cscript>/);
  match(source, /\\nnew line/);
  equal(source.includes("<script>"), false);
});
Deno.test("both exports use actual page modules, scoped styles and unchanged form endpoints", () => {
  const site = addPage(starterWebsite("Studio"), "contact", "Contact");
  site.pages[1].nodes.push({
    id: "inquiry",
    tag: "form",
    text: "Write to us",
    styles: { padding: "30px" },
    children: [],
    layer: parseLayer("form", {}),
  });
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    const page = files.find((f) =>
      f.name === (format === "fresh"
        ? "routes/contact.tsx"
        : "src/pages/" + site.pages[1].id + ".tsx")
    )!.content;
    match(page, /<form/);
    match(page, /method="post"/);
    match(page, new RegExp("/api/forms/" + site.pages[1].id + "/inquiry"));
    match(page, /htmlFor=/);
    match(page, /required=\{true\}/);
    equal(page.includes("dangerouslySetInnerHTML"), false);
    const css = files.find((f) =>
      f.name === (format === "fresh" ? "assets/styles.css" : "src/site.css")
    )!.content;
    match(css, /padding: 30px/);
    match(css, /data-node="inquiry"/);
    if (format === "react") {
      const app = files.find((f) =>
        f.name === "src/App.tsx"
      )!.content;
      match(app, /<Page key=\{page.id\}/);
      equal(app.includes("dangerouslySetInnerHTML"), false);
      equal(
        files.find((f) =>
          f.name === "src/site.ts"
        )!.content.includes(
          '"html":',
        ),
        false,
      );
    } else {equal(
        files.find((f) => f.name === "routes/_app.tsx")!.content.includes(
          "dangerouslySetInnerHTML",
        ),
        false,
      );}
  }
});

Deno.test("export preparation extracts uploaded media once and leaves the saved draft intact", () => {
  const data = "data:image/png;base64,iVBORw0KGgo=";
  const site = starterWebsite("Studio");
  site.pages[0].nodes.push({
    id: "photo",
    tag: "img",
    text: "",
    styles: { width: "100%" },
    children: [],
    layer: parseLayer("img", { src: data, alt: "Photo" }),
  });
  site.commerce = {
    currency: "usd",
    provider: "preview",
    products: [{
      id: "sample",
      name: "Sample",
      description: "",
      amount: 100,
      image: data,
      active: true,
    }],
    slots: [],
  };
  const before = structuredClone(site);
  for (const format of ["fresh", "react"] as const) {
    const files = projectSourceFiles(site, format);
    const media = files.filter((f) => f.name.includes("/media/"));
    equal(media.length, 1);
    deepStrictEqual([...media[0].bytes!], [137, 80, 78, 71, 13, 10, 26, 10]);
    const page = files.find((f) =>
      f.name ===
        (format === "fresh" ? "routes/index.tsx" : "src/pages/home.tsx")
    )!.content;
    match(page, /src="\/media\/image-1.png"/);
    equal(page.includes("base64"), false);
  }
  deepStrictEqual(site, before);
});
