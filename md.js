// Converts each notebooks/*.md to the notebooks/*.html that Notebook Kit builds.
//
// Prose becomes Markdown cells. A top-level fence whose language is a cell mode becomes a cell of that mode, and the
// rest of its info string sets the cell's attributes, as in the HTML: ```sql output=levels database=duckdb hidden pinned
// Any other fence, such as ```text, stays in the prose as a code block. The first "# " heading is the notebook's title.
import { readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { serialize, toCell, toNotebook } from "@observablehq/notebook-kit";
import { JSDOM } from "jsdom";

// Notebook Kit's own copy of markdown-it, so prose splits where the kit's renderer would read it.
const MarkdownIt = createRequire(import.meta.resolve("@observablehq/notebook-kit"))("markdown-it");

const MODES = new Set(["js", "ts", "ojs", "html", "tex", "dot", "sql", "sql.view", "node", "python", "r"]);
const FLAGS = new Set(["hidden", "pinned"]);
const VALUES = new Set(["output", "database", "format"]);
const JAVASCRIPT = new Set(["js", "ts", "ojs"]);
// The formats Notebook Kit reads back from the HTML; it turns any other into the default.
const FORMATS = new Set(["text", "blob", "buffer", "json", "csv", "tsv", "jpeg", "png", "webp", "gif", "arrow", "parquet", "html", "svg", "xml"]);
// Marks the HTML md.js writes, so it can delete a page whose Markdown is gone without touching anything else.
const GENERATED = "<!-- Written by md.js from notebooks/";

export function convert(source, name = "notebook") {
  // markdown-it's line numbers count \r\n, \r and \n as line breaks.
  const lines = source.split(/\r\n?|\n/);
  const cells = [];
  const prose = (from, to) => {
    // Only blank lines are trimmed, so an indented code block keeps its indent.
    const value = lines.slice(from, to).join("\n").replace(/^(\s*\n)+|\s+$/g, "");
    if (value) cells.push({ mode: "md", value });
  };
  // Notebook Kit renders prose with HTML on, so a fence inside an HTML comment or block stays prose.
  const tokens = new MarkdownIt({ html: true }).parse(source, {});
  let line = 0;
  for (const token of tokens) {
    if (token.level !== 0 || (token.type !== "fence" && token.type !== "html_block")) continue;
    const at = `${name}: line ${token.map[0] + 1}`;
    // A comment or <pre>, <script>, <style> or <textarea> block left open runs to the end, taking every cell after it.
    if (token.type === "html_block") {
      const end = /^\s*<!--/.test(token.content) ? "-->" : /^\s*<(pre|script|style|textarea)[\s>]/i.exec(token.content)?.[1];
      if (end && !token.content.toLowerCase().includes(end === "-->" ? end : `</${end.toLowerCase()}>`)) {
        throw new Error(`${at}: the HTML ${end === "-->" ? "comment" : `<${end}>`} isn't closed`);
      }
      continue;
    }
    // A forgotten closing fence is still valid Markdown: the fence runs on to the next bare fence, so every fence is
    // checked, cell or not. markdown-it closes one at a line of the same marker, at least as long, indented under 4.
    const marker = `[${token.markup[0]}]{${token.markup.length},}`;
    if (token.map[1] - token.map[0] < 2 || !new RegExp(`^ {0,3}${marker}\\s*$`).test(lines[token.map[1] - 1])) {
      throw new Error(`${at}: the fence isn't closed`);
    }
    // A line that would open a fence, if this one were closed, means an earlier closing fence is missing.
    if (new RegExp(`^ {0,3}${marker}\\s*\\S`, "m").test(token.content)) {
      throw new Error(`${at}: the fence isn't closed before the next fence`);
    }
    const [mode, ...words] = token.info.trim().split(/\s+/);
    if (!MODES.has(mode)) {
      // A cell type in capitals, or a fence with cell attributes, was meant to be a cell.
      const meant = MODES.has(mode.toLowerCase()) || words.some((w) => FLAGS.has(w) || VALUES.has(w.split("=")[0]));
      if (meant) throw new Error(`${at}: unknown cell type ${mode}; cell types are lowercase`);
      continue;
    }
    prose(line, token.map[0]);
    line = token.map[1];
    const cell = { mode, value: token.content.replace(/\n$/, "") };
    for (const word of words) {
      const [key, value] = word.split(/=(.*)/s);
      if ((FLAGS.has(key) || VALUES.has(key)) && Object.hasOwn(cell, key)) throw new Error(`${at}: ${key} is set twice`);
      if (FLAGS.has(key) && value === undefined) cell[key] = true;
      else if (VALUES.has(key) && value) cell[key] = value;
      else throw new Error(`${at}: unknown cell attribute ${word}`);
    }
    if (cell.format && !FORMATS.has(cell.format)) throw new Error(`${at}: unknown format ${cell.format}`);
    // Notebook Kit ignores output on a JavaScript cell, whose declarations name its values.
    if (cell.output && JAVASCRIPT.has(mode)) throw new Error(`${at}: a ${mode} cell can't have output`);
    const kept = toCell({ id: 0, ...cell });
    for (const key of ["database", "format"]) {
      if (cell[key] && !kept[key]) throw new Error(`${at}: a ${mode} cell can't have ${key}`);
    }
    cells.push(cell);
  }
  prose(line, lines.length);

  const h1 = tokens.findIndex((t) => t.type === "heading_open" && t.tag === "h1" && t.level === 0);
  // The heading's text without its Markdown, so `# Tides *and* currents` is "Tides and currents".
  const text = (t) => (t.type === "text" || t.type === "code_inline" ? t.content : t.type === "softbreak" ? " " : "");
  const title = h1 >= 0 && tokens[h1 + 1].children.map(text).join("").trim();
  if (!title) throw new Error(`${name} has no "# " heading for its title`);
  const notebook = toNotebook({
    title,
    theme: { light: "air", dark: "midnight" },
    // Pinned is false unless the fence says so, as in the HTML; toCell would pin every code cell.
    cells: cells.map(({ pinned = false, ...cell }, i) => toCell({ id: i + 1, pinned, ...cell })),
  });
  const html = serialize(notebook, { document: new JSDOM().window.document });
  return html.replace("\n", () => `\n${GENERATED}${name.split("/").pop().replaceAll("--", "-\\-")} -->\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const dir = join(import.meta.dirname, "notebooks");
  const files = readdirSync(dir);
  for (const file of files.filter((f) => f.endsWith(".html") && f !== "index.html")) {
    if (!readFileSync(join(dir, file), "utf8").includes(GENERATED)) {
      throw new Error(`notebooks/${file} isn't from a Markdown notebook; notebooks are written in Markdown`);
    }
    rmSync(join(dir, file));
  }
  for (const file of files.filter((f) => f.endsWith(".md") && !f.startsWith("."))) {
    if (file === "index.md") throw new Error("notebooks/index.md can't be used: index.html is the list of notebooks");
    writeFileSync(join(dir, file.replace(/\.md$/, ".html")), convert(readFileSync(join(dir, file), "utf8"), `notebooks/${file}`));
  }
}
