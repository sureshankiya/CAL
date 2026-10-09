// Pack dist-static/ into one Artifact page (no doctype/html/head/body — the host wraps it):
// inline CSS, the app bundle and the pdf.js worker (base64 → blob URL; the worker carries
// binary string data that cannot be published as a separate text file).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const dir = "dist-static/assets";
const files = readdirSync(dir);
const css = readFileSync(`${dir}/${files.find((f) => f.endsWith(".css"))}`, "utf8");
const worker = files.find((f) => f.startsWith("pdf.worker"));
const workerExpr = `new URL(new URL(\`${worker}\`,import.meta.url).href,\`\`+import.meta.url).toString()`;
let js = readFileSync(`${dir}/${files.find((f) => f.endsWith(".js"))}`, "utf8");
if (!js.includes(workerExpr)) throw new Error("pdf.js worker URL expression not found in the bundle");
js = js.replace(workerExpr, "window.__HC_PDF_WORKER__").replace(/<\/script/gi, "<\\/script");
// literal U+FFFD (charset tables in the font / Word libraries) as escapes: same value in JS
// string, template and regex literals, and the published page carries no replacement characters
js = js.replace(/\uFFFD/g, "\\uFFFD");
const workerB64 = readFileSync(`${dir}/${worker}`).toString("base64");

const out = process.argv[2] ?? "dist-artifact";
mkdirSync(out, { recursive: true });
const page = `<title>HouseCalc</title>
<style>${css.replace(/<\/style/gi, "<\\/style")}</style>
<div id="root"></div>
<script>(function(){var b=atob("${workerB64}"),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);window.__HC_PDF_WORKER__=URL.createObjectURL(new Blob([u],{type:"text/javascript"}));})();</script>
<script type="module">${js}</script>
`;
writeFileSync(`${out}/housecalc.html`, page);
console.log(`${out}/housecalc.html ${(page.length / 1e6).toFixed(2)} MB (pdf.js worker inlined)`);
