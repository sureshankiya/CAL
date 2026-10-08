/**
 * Print check — renders the example house package in headless Chromium,
 * prints it to PDF (US Letter) and verifies the output:
 *   - the cover is on page 1 and no page is blank;
 *   - every page carries the "Page n of N" footer and the project footer;
 *   - every sheet number of the package appears in a title block.
 *
 * Usage:  bun run dev   (in another shell)
 *         node scripts/print-check.mjs [url] [out.pdf] [project button] [footer text]
 *   e.g.  node scripts/print-check.mjs http://127.0.0.1:8080/ sm.pdf "San Miguel" "1109 San Miguel"
 */

import { chromium } from "playwright";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import fs from "node:fs";

const url = process.argv[2] ?? "http://127.0.0.1:8080/";
const out = process.argv[3] ?? "print-check.pdf";
const projectButton = process.argv[4];
const footer = process.argv[5] ?? "Example Residence —";

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH ? {} : { executablePath: "/opt/pw-browsers/chromium" },
);
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
if (projectButton) {
  await page.getByRole("button", { name: projectButton, exact: true }).click();
  await page.waitForTimeout(500);
}
await page.getByRole("button", { name: /Full package/ }).click();
await page.waitForTimeout(1500);
const sheets = await page.locator("article.report-root").count();
await page.emulateMedia({ media: "print" });
await page.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true });
await browser.close();

const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(out)) }).promise;
const problems = [];
const sheetNos = new Set();
for (let i = 1; i <= doc.numPages; i++) {
  const p = await doc.getPage(i);
  const text = (await p.getTextContent()).items.map((t) => t.str).join(" ");
  if (text.replace(/\s+/g, "").length < 120) problems.push(`page ${i}: blank or nearly blank`);
  if (!text.includes(`Page ${i} of ${doc.numPages}`))
    problems.push(`page ${i}: missing "Page ${i} of ${doc.numPages}"`);
  if (!text.includes(footer)) problems.push(`page ${i}: missing project footer`);
  if (i === 1 && !/STRUCTURAL CALCULATIONS/.test(text)) problems.push("page 1: cover not first");
  const m = text.match(/Sheet no\.\/rev\.\s+(\d+)\s*\/\s*\S+/);
  if (m) sheetNos.add(Number(m[1]));
}
for (let s = 1; s <= sheets; s++) if (!sheetNos.has(s)) problems.push(`sheet ${s}: title block not found in the PDF`);
if (errors.length) problems.push(...errors.map((e) => `page error: ${e}`));

console.log(`${out}: ${doc.numPages} pages, ${sheets} sheets`);
if (problems.length) {
  console.log(problems.join("\n"));
  process.exit(1);
}
console.log("print check passed");
