import { COMMERCE_SERVER_SOURCE } from "./commerce-runtime.ts";
import { metadataHtml } from "./seo.ts";
import { socialPath, socialPng } from "./social.ts";
import { LAYER_CSS, pageMarkup } from "./markup.ts";
import { RUNTIME_SOURCE } from "./interactions.ts";
import { FORM_SERVER_SOURCE } from "./form-runtime.ts";
/** Small standards-compliant stored ZIP writer for exporting source without a runtime dependency. */
export function sourceZip(
  files: { name: string; content: string; bytes?: Uint8Array }[],
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder(),
    local: Uint8Array[] = [],
    directory: Uint8Array[] = [];
  let offset = 0, size = 0;
  const crc = (bytes: Uint8Array) => {
    let value = 0xffffffff;
    for (const b of bytes) {
      value ^= b;
      for (let i = 0; i < 8; i++) {
        value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
      }
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  for (const file of files) {
    const name = encoder.encode(file.name),
      data = file.bytes ?? encoder.encode(file.content),
      checksum = crc(data);
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const record = new Uint8Array(46 + name.length),
      r = new DataView(record.buffer);
    r.setUint32(0, 0x02014b50, true);
    r.setUint16(4, 20, true);
    r.setUint16(6, 20, true);
    r.setUint16(8, 0x800, true);
    r.setUint16(14, 33, true);
    r.setUint32(16, checksum, true);
    r.setUint32(20, data.length, true);
    r.setUint32(24, data.length, true);
    r.setUint16(28, name.length, true);
    r.setUint32(42, offset, true);
    record.set(name, 46);
    local.push(header, data);
    directory.push(record);
    offset += header.length + data.length;
    size += record.length;
  }
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, offset, true);
  const result = new Uint8Array(new ArrayBuffer(offset + size + 22));
  let position = 0;
  for (const part of [...local, ...directory, end]) {
    result.set(part, position);
    position += part.length;
  }
  return result;
}

import { allNodes, formatStyles } from "./site.ts";
import {
  parseWebsite,
  type WebsiteDocument,
  websiteSourceFiles,
} from "./website.ts";
export type ExportFormat = "fresh" | "react";
export interface ProjectFile {
  bytes?: Uint8Array;
  name: string;
  content: string;
}
const pretty = (value: unknown) =>
  JSON.stringify(value, null, 2).replaceAll("<", "\\u003c") + "\n";
const escapeHtml = (value: string) =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(
    '"',
    "&quot;",
  );
export function reactAppSource(): string {
  return `import { useEffect, useRef, useState } from "react";
import { site } from "./site";
import { mount } from "./runtime.js";
import "./site.css";
export default function App() {
 const [path,setPath]=useState(window.location.pathname);
 const root=useRef<HTMLElement>(null);
 const page=site.pages.find(p=>p.path===path);
 useEffect(()=>{const pop=()=>setPath(window.location.pathname);window.addEventListener("popstate",pop);return()=>window.removeEventListener("popstate",pop)},[]);
 useEffect(()=>{document.title=page?.title??"Page not found";if(page){const parsed=new DOMParser().parseFromString(page.head.replaceAll('https://dragonfruit.invalid',window.location.origin),'text/html');document.head.querySelectorAll('meta[name="description"],meta[name="robots"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"]').forEach(n=>n.remove());parsed.head.querySelectorAll('meta,link').forEach(n=>document.head.append(n));}if(root.current)return mount(root.current);},[page]);
 if(!page)return <main><h1>Page not found</h1><a href="/">Return home</a></main>;
 return <main ref={root} className={"df-page-"+page.id} onClickCapture={event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const anchor=(event.target as HTMLElement).closest("a"),href=anchor?.getAttribute("href");
  if(anchor?.target==="_blank"||anchor?.hasAttribute("download"))return;
  if(href&&site.pages.some(p=>p.path===href)){event.preventDefault();history.pushState({},"",href);setPath(href);window.scrollTo(0,0)}
 }} dangerouslySetInnerHTML={{__html:page.html}}/>;
}
`;
}
export function projectSourceFiles(
  input: WebsiteDocument,
  format: ExportFormat,
  deploymentFiles: ProjectFile[] = [],
): ProjectFile[] {
  const website = parseWebsite(input);
  if (format !== "fresh" && format !== "react") {
    throw new Error("Choose Fresh or React");
  }
  const integrationReadme =
    `\n## Forms and interactions\n\nInteractive layers include editable JavaScript in the runtime module and embedded layer options. Animation presets respect reduced-motion preferences. The preview editor never delivers submissions.\n\nForm APIs are included in this export. Copy .env.example to .env and fill in only the server environment variables for your chosen integrations. Never put credentials in public browser files. Configure PUBLIC_ORIGIN to the exact browser origin in production (including HTTPS when behind a reverse proxy). Resend needs a verified sender. Mailchimp uses pending status for double opt-in and requires the configured consent checkbox. Webhooks send JSON to the HTTPS URL in the configured server environment variable.\n\nSubmissions are validated, size bounded, honeypot checked, and limited per form per minute in this process. Multi-instance deployments need a shared limiter and any additional abuse controls required by your traffic. Submissions are delivered to the provider, not stored locally. API errors are sanitized; inspect provider logs for delivery diagnostics. Preview connections intentionally deliver nothing.\n\nReferences: https://resend.com/docs/api-reference/emails/send-email and https://mailchimp.com/developer/marketing/api/lists/members/create-member\n`;
  const environment = new Set<string>(["PUBLIC_ORIGIN", "STRIPE_SECRET_KEY"]);
  for (const api of website.apis ?? []) {
    if (api.provider === "resend") {
      [api.credentialEnv, api.fromEnv, api.toEnv].forEach((n) =>
        environment.add(n)
      );
    }
    if (api.provider === "mailchimp") {
      [api.credentialEnv, api.audienceEnv].forEach((n) => environment.add(n));
    }
    if (api.provider === "webhook") {
      [api.credentialEnv, api.urlEnv].forEach((n) => environment.add(n));
    }
  }
  const common: ProjectFile[] = [{
    name: ".env.example",
    content: [...environment].map((n) => n + "=").join("\n") + "\n",
  }, {
    name: ".gitignore",
    content: "node_modules/\n_fresh/\ndist/\n.env\n",
  }];
  const socialFiles: ProjectFile[] = website.pages.map((page) => ({
    name: (format === "fresh" ? "static" : "public") + socialPath(page.path),
    content: "",
    bytes: socialPng(page.title, website.title),
  }));
  common.push(...socialFiles);
  const deploy = deploymentFiles.map((file) => ({
    ...file,
    name: "deploy/" + file.name,
  }));
  if (format === "fresh") {
    const compilerOptions = {
      jsx: "precompile",
      jsxImportSource: "preact",
      lib: ["dom", "dom.iterable", "deno.ns"],
      types: ["vite/client"],
      jsxPrecompileSkipElements: [
        "a",
        "img",
        "source",
        "body",
        "html",
        "head",
        "title",
        "meta",
        "script",
        "link",
        "style",
        "base",
        "noscript",
        "template",
      ],
    };
    const deno = {
      nodeModulesDir: "auto",
      compilerOptions,
      imports: {
        fresh: "jsr:@fresh/core@2.3.3",
        "@fresh/plugin-vite": "jsr:@fresh/plugin-vite@1.1.2",
        preact: "npm:preact@10.29.1",
        "preact/jsx-runtime": "npm:preact@10.29.1/jsx-runtime",
        "preact/jsx-dev-runtime": "npm:preact@10.29.1/jsx-dev-runtime",
        vite: "npm:vite@7.1.4",
      },
      tasks: {
        dev: "deno run -A --env-file=.env npm:vite --host 127.0.0.1",
        build: "deno run -A npm:vite build",
        start:
          "deno serve --env-file=.env --allow-net --allow-env --allow-read --host 0.0.0.0 --port 8000 _fresh/server.js",
        check: "deno check main.ts routes/**/*.tsx",
      },
    };

    return [
      ...common,
      ...deploy,
      {
        name: "server/site.ts",
        content: "export const website = " + pretty(website) + ";\n",
      },
      { name: "server/forms.js", content: FORM_SERVER_SOURCE },
      { name: "server/commerce.js", content: COMMERCE_SERVER_SOURCE },
      {
        name: "static/runtime.js",
        content: RUNTIME_SOURCE + "\nmount(document);\n",
      },
      ...websiteSourceFiles(website),
      {
        name: "deno.json",
        content: pretty(deno),
      },
      {
        name: "main.ts",
        content:
          'import { App, staticFiles } from "fresh";\nimport { website } from "./server/site.ts";\nimport { handleForm } from "./server/forms.js";\nimport { handleCommerce } from "./server/commerce.js";\nexport const app = new App();\napp.post("/api/forms/:page/:form", ctx => handleForm(ctx.req,website,(name:string)=>Deno.env.get(name)));\napp.get("/api/commerce/:action", ctx => handleCommerce(ctx.req,website,(name:string)=>Deno.env.get(name)));\napp.post("/api/commerce/:action", ctx => handleCommerce(ctx.req,website,(name:string)=>Deno.env.get(name)));\napp.use(staticFiles());\napp.fsRoutes();\n',
      },
      {
        name: "utils.ts",
        content:
          'import { createDefine } from "fresh";\nexport const define = createDefine();\n',
      },
      {
        name: "vite.config.ts",
        content:
          'import { defineConfig } from "vite";\nimport { fresh } from "@fresh/plugin-vite";\nexport default defineConfig({ plugins: [fresh()] });\n',
      },
      {
        name: "client.ts",
        content:
          'import "@fresh/plugin-vite/client";\nimport "./assets/styles.css";\n',
      },
      {
        name: "assets/styles.css",
        content: LAYER_CSS,
      },
      {
        name: "routes/_app.tsx",
        content:
          'import { define } from "../utils.ts";\nimport { website } from "../server/site.ts";\nimport { metadataHtml } from "../server/seo.js";\nexport default define.page(({Component,url})=>{const page=website.pages.find(p=>p.path===url.pathname);const origin=Deno.env.get("PUBLIC_ORIGIN")||url.origin;const head=\'<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>\'+(page?metadataHtml(page,origin,website.title):\'<meta name="robots" content="noindex"/>\')+\'<script type="module" src="/runtime.js"></script>\';return <html lang="en"><head dangerouslySetInnerHTML={{__html:head}}/><body><Component/></body></html>});\n',
      },
      { name: "server/seo.js", content: SEO_SOURCE },
      {
        name: "README.md",
        content: "# " + website.title +
          "\n\nA complete Fresh 2 website exported from dragonfruit. Each page is a server-rendered file route, with navigation between all pages.\n\n## Requirements\n\nDeno 2.9.5 (the tested runtime).\n\n## Development\n\n```sh\ncp .env.example .env\ndeno install\ndeno task dev\n```\n\nOpen the URL printed by Vite.\n\n## Production\n\n```sh\ndeno task check\ndeno task build\ndeno task start\n```\n\nThe production server listens on port 8000. Serve it behind your HTTPS reverse proxy. No dragonfruit server or database is needed. The first install creates a deno.lock; retain it for repeatable installs.\n\nTemplates provide editable presentation content. Contact details, pricing, and blog entries are examples; Markdown articles and commerce layers are included. Configure Stripe and booking URLs before launch.\n" +
          integrationReadme,
      },
    ];
  }
  const css = LAYER_CSS + "\n" +
    "*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f8f7f2}h1,h2,p{margin:0;white-space:pre-line}a{white-space:pre-line}.not-found{padding:48px}\n" +
    website.pages.map((page) =>
      allNodes(page).map((n) =>
        ".df-page-" + page.id + ' [data-node="' + n.id + '"] {\n' +
        formatStyles(n.styles) + "\n}"
      ).join("\n")
    ).join("\n");
  return [
    ...common,
    ...deploy,
    {
      name: "package.json",
      content: pretty({
        name: "dragonfruit-website",
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "node scripts/dev.mjs",
          start: "node --env-file-if-exists=.env server/index.mjs",
          build: "tsc --noEmit && vite build",
          preview: "node --env-file-if-exists=.env server/index.mjs",
        },
        dependencies: { react: "19.1.1", "react-dom": "19.1.1" },
        devDependencies: {
          vite: "7.1.4",
          typescript: "5.9.2",
          "@types/react": "19.1.11",
          "@types/react-dom": "19.1.9",
        },
      }),
    },
    {
      name: "tsconfig.json",
      content: pretty({
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          moduleResolution: "Bundler",
          jsx: "react-jsx",
          strict: true,
          allowJs: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
        },
        include: ["src"],
      }),
    },
    {
      name: "vite.config.ts",
      content:
        'import { defineConfig } from "vite";\nexport default defineConfig({ esbuild: { jsx: "automatic" }, server: {proxy: {"/api":"http://127.0.0.1:8787"}} });\n',
    },
    {
      name: "index.html",
      content:
        '<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>' +
        escapeHtml(website.title) +
        '</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
    },
    {
      name: "src/main.tsx",
      content:
        'import { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App/>);\n',
    },
    { name: "src/App.tsx", content: reactAppSource() },
    {
      name: "src/site.ts",
      content:
        "export const site: {title:string;pages:{id:string;name:string;path:string;title:string;html:string;head:string}[]} = " +
        pretty({
          title: website.title,
          pages: website.pages.map((p) => ({
            id: p.id,
            name: p.name,
            path: p.path,
            title: p.title,
            html: pageMarkup(p, p.id),
            head: metadataHtml(p, "https://dragonfruit.invalid", website.title),
          })),
        }) + ";\n",
    },
    { name: "src/site.css", content: css + "\n" },
    { name: "src/runtime.js", content: RUNTIME_SOURCE },
    { name: "server/forms.mjs", content: FORM_SERVER_SOURCE },
    { name: "server/commerce.mjs", content: COMMERCE_SERVER_SOURCE },
    { name: "server/seo.mjs", content: SEO_SOURCE },
    { name: "server/site.json", content: pretty(website) },
    { name: "server/index.mjs", content: NODE_SERVER_SOURCE },
    { name: "scripts/dev.mjs", content: NODE_DEV_SOURCE },
    {
      name: "README.md",
      content: "# " + website.title +
        "\n\nA complete React + Vite website exported from dragonfruit, including all page designs and browser navigation.\n\n## Requirements\n\nNode.js 22.12+ and npm.\n\n## Development\n\n```sh\ncp .env.example .env\nnpm install\nnpm run dev\n```\n\n## Production build\n\n```sh\nnpm run build\nnpm run preview\n```\n\nRun `npm start` after building. The included Node server serves dist, supports deep page URLs, and handles form submissions. PORT defaults to 8787; use PUBLIC_ORIGIN for the browser-facing URL behind an HTTPS proxy. `npm run dev` starts the API server and Vite together. Static-only hosting can serve dist with an index.html fallback, but forms then need the included backend deployed separately and /api proxied to it. Keep the generated package-lock.json. No dragonfruit server or database is needed.\n\nTemplates provide editable presentation content; contact details, prices, and article summaries are examples. Markdown articles and commerce layers are included. Configure Stripe and booking URLs before launch.\n" +
        integrationReadme,
    },
  ];
}

const NODE_DEV_SOURCE = String.raw`import {spawn} from 'node:child_process';
const api=spawn(process.execPath,['--env-file-if-exists=.env','server/index.mjs'],{stdio:'inherit',env:{...process.env,PUBLIC_ORIGIN:process.env.PUBLIC_ORIGIN||'http://127.0.0.1:5173'}});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'});
let stopping=false;function stop(code=0){if(stopping)return;stopping=true;api.kill();vite.kill();setTimeout(()=>process.exit(code),200).unref();}
api.on('exit',code=>stop(code??0));vite.on('exit',code=>stop(code??0));process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
`;
const NODE_SERVER_SOURCE = String.raw`import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {handleForm} from './forms.mjs';
import {handleCommerce} from './commerce.mjs';
import {metadataHtml} from './seo.mjs';
const website=JSON.parse(await readFile(new URL('./site.json',import.meta.url),'utf8'));
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   let size=0;const parts=[];for await(const part of req){size+=part.length;if(size>32768){res.writeHead(413,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Submission is too large'}));return;}parts.push(part);}
   const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(parts)}:{})});
   const response=await (url.pathname.startsWith('/api/commerce/') ? handleCommerce : handleForm)(request,website,name=>process.env[name]);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
  }
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  let file=path;let bytes;try{bytes=await readFile(file);}catch{if(extname(url.pathname)){res.writeHead(404);res.end();return;}file=resolve(root,'index.html');bytes=await readFile(file);}
  const page=website.pages.find(p=>p.path===url.pathname);
  if(extname(file)==='.html'){if(!page){res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end('<h1>Page not found</h1>');return;}const origin=process.env.PUBLIC_ORIGIN||url.origin;bytes=Buffer.from(bytes.toString().replace(/<title>[\s\S]*?<\/title>/,'').replace('</head>',metadataHtml(page,origin,website.title)+'</head>'));}
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Build the website before starting, or check server configuration.'}));}
});
server.requestTimeout=15000;server.listen(Number(process.env.PORT||8787),'0.0.0.0',()=>console.log('Website and form API listening on port '+(process.env.PORT||8787)));
`;

const SEO_SOURCE = String.raw`
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function metadataHtml(page,origin,siteName){
 const url=new URL(page.path,origin).href,image=new URL(page.seo?.image||'/social/'+(page.path==='/'?'_root':page.path.slice(1).replaceAll('/','__'))+'.png',origin).href;
 const description=page.seo?.description||'Discover '+page.title+'. Stories, products, and ideas from '+siteName+'.';
 const meta=(key,value,property=false)=>'<meta '+(property?'property':'name')+'="'+key+'" content="'+esc(value)+'"/>';
 return '<title>'+esc(page.title)+'</title><link rel="canonical" href="'+esc(url)+'"/>'+meta('description',description)+meta('robots',page.seo?.noindex?'noindex,nofollow':'index,follow')+[['og:type',page.article?'article':'website'],['og:site_name',siteName],['og:title',page.title],['og:description',description],['og:url',url],['og:image',image],['og:image:width','1200'],['og:image:height','630'],['og:image:alt',page.title]].map(([k,v])=>meta(k,v,true)).join('')+meta('twitter:card','summary_large_image')+meta('twitter:title',page.title)+meta('twitter:description',description)+meta('twitter:image',image)+meta('twitter:image:alt',page.title);
}
`;
