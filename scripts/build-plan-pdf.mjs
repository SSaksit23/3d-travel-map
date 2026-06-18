// Converts the project-plan Markdown into a print-styled HTML file.
// Mermaid code fences are emitted as <pre class="mermaid"> so they render
// as diagrams when the HTML is printed to PDF by a headless browser.
import { marked } from "marked";
import fs from "node:fs";
import path from "node:path";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node build-plan-pdf.mjs <input.md> <output.html>");
  process.exit(1);
}

const md = fs.readFileSync(inputPath, "utf8");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const renderer = new marked.Renderer();
renderer.code = (codeOrToken, infostring) => {
  let text;
  let lang;
  if (typeof codeOrToken === "object" && codeOrToken !== null) {
    text = codeOrToken.text;
    lang = codeOrToken.lang;
  } else {
    text = codeOrToken;
    lang = infostring;
  }
  lang = (lang || "").trim().split(/\s+/)[0].toLowerCase();
  if (lang === "mermaid") {
    return `<pre class="mermaid">${esc(text)}</pre>`;
  }
  return `<pre><code>${esc(text)}</code></pre>`;
};

marked.setOptions({ renderer, gfm: true, breaks: false });

const body = marked.parse(md);

const title = "Voyage AI 3D — Project Plan";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
<style>
  @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Arial, Helvetica, sans-serif;
    font-size: 10.5pt; line-height: 1.55; color: #1b1f2a;
    max-width: 100%; margin: 0; padding: 0;
  }
  h1, h2, h3, h4 { color: #1f2a52; page-break-after: avoid; line-height: 1.25; }
  h1 { font-size: 23pt; border-bottom: 3px solid #6366f1; padding-bottom: 8px; margin: 0 0 14px; }
  h2 { font-size: 15.5pt; border-bottom: 1px solid #dcdce6; padding-bottom: 5px; margin: 26px 0 12px; }
  h3 { font-size: 12.5pt; margin: 18px 0 8px; }
  h4 { font-size: 11pt; margin: 14px 0 6px; }
  p { margin: 8px 0; }
  a { color: #4f46e5; text-decoration: none; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9pt; page-break-inside: avoid; }
  th, td { border: 1px solid #cdd0db; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #eef2ff; color: #28306b; font-weight: 600; }
  tr:nth-child(even) td { background: #fafbff; }
  code { background: #f1f1f7; padding: 1px 5px; border-radius: 3px; font-family: "Consolas", "Courier New", monospace; font-size: 9pt; color: #b3146a; }
  pre { background: #f7f8fc; border: 1px solid #e3e4ef; border-radius: 6px; padding: 12px 14px; overflow: auto; page-break-inside: avoid; margin: 12px 0; }
  pre code { background: none; padding: 0; color: #2b2f3a; font-size: 9pt; }
  pre.mermaid { background: #ffffff; border: 1px solid #ececf4; text-align: center; padding: 14px; }
  blockquote { border-left: 4px solid #6366f1; margin: 12px 0; padding: 4px 14px; color: #4a4f63; background: #f6f7fc; font-style: italic; }
  hr { border: none; border-top: 1px solid #e0e0ea; margin: 22px 0; }
  strong { color: #1f2540; }
  h1 + p, h2 + p { margin-top: 4px; }
</style>
</head>
<body>
${body}
<script type="module">
  try {
    const mermaid = (await import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs")).default;
    mermaid.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "loose" });
    await mermaid.run({ querySelector: "pre.mermaid" });
  } catch (e) {
    console.error("mermaid render failed", e);
  } finally {
    window.__renderComplete = true;
    document.title = document.title + " [ready]";
  }
</script>
</body>
</html>`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, html, "utf8");
console.log("Wrote HTML:", outputPath, `(${(html.length / 1024).toFixed(1)} KB)`);
