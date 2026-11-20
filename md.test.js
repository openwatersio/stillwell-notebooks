import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deserialize } from "@observablehq/notebook-kit";
import { JSDOM } from "jsdom";
import { convert } from "./md.js";

const parser = new (new JSDOM().window.DOMParser)();
const cells = (md) => deserialize(convert(md), { parser }).cells.map(({ mode, value }) => [mode, value]);

test("prose, cells and attributes", () => {
  const html = convert(["```python", "# not the title", "```", "", "# Tides", "", "Text with ${x}.", "", "```sql output=x database=duckdb hidden pinned", "SELECT 1", "```", "", "```text", "shown, not run", "```"].join("\n"), "notebooks/tides.md");
  assert.match(html, /^<!doctype html>\n<!-- Written by md.js from notebooks\/tides.md -->\n<notebook /);
  assert.match(html, /<title>Tides<\/title>/);
  assert.match(html, /<script id="1" type="text\/x-python" format="buffer">\s+# not the title\s+<\/script>/);
  assert.match(html, /<script id="2" type="text\/markdown">\s+# Tides\s+Text with \$\{x\}\.\s+<\/script>/);
  assert.match(html, /<script id="3" type="application\/sql" pinned="" hidden="" database="duckdb" output="x">\s+SELECT 1\s+<\/script>/);
  assert.match(html, /<script id="4" type="text\/markdown">\s+```text\s+shown, not run\s+```\s+<\/script>/);
});

test("a sql.view fence is a cell", () => {
  assert.match(convert("# T\n\n```sql.view output=v database=duckdb\nSELECT 1\n```"), /<script id="2" type="application\/sql\+view" database="duckdb" output="v">/);
});

test("the title is the heading's text", () => {
  assert.match(convert("# Tides *and* `currents` <em>x</em>"), /<title>Tides and currents x<\/title>/);
  assert.match(convert("# T", "a$'b--c.md"), /<!-- Written by md.js from notebooks\/a\$'b-\\-c.md -->/);
});

test("prose keeps an indented code block, and bare CR line endings work", () => {
  assert.deepEqual(cells("# T\n\n```js\n1\n```\n\n    code\n\nMore"), [["md", "# T"], ["js", "1"], ["md", "    code\n\nMore"]]);
  assert.deepEqual(cells("# T\r\r```js\r1\r```\rAfter"), [["md", "# T"], ["js", "1"], ["md", "After"]]);
});

test("ordinary code blocks stay prose", () => {
  for (const block of ["```bash title=x\nls\n```", "```json {1,3}\n{}\n```", "````md\n```sql output=x\nSELECT 1\n```\n````", "```\nplain\n```"]) {
    assert.deepEqual(cells(`# T\n\n${block}`), [["md", `# T\n\n${block}`]]);
  }
});

test("a fence in an HTML comment stays prose", () => {
  assert.deepEqual(cells("# T\n\n<!--\n```js\n1\n```\n-->"), [["md", "# T\n\n<!--\n```js\n1\n```\n-->"]]);
});

test("getting-started.md converts to the cells of the HTML it was ported from", () => {
  const notebook = deserialize(convert(readFileSync("notebooks/getting-started.md", "utf8"), "getting-started.md"), { parser });
  assert.equal(notebook.title, "Getting started with Stillwell");
  const modes = {};
  for (const { mode } of notebook.cells) modes[mode] = (modes[mode] ?? 0) + 1;
  assert.deepEqual(modes, { md: 14, js: 14, html: 2, sql: 13 });
  assert.deepEqual(
    notebook.cells.filter((c) => c.output).map((c) => `${c.output}:${c.database}:${c.hidden}:${c.pinned}`),
    ["mapStations", "stats", "mapCredits", "found", "nearest", "years", "levels", "fiveYears", "inDatums", "credits", "surgeDays", "surge", "months"]
      .map((output) => `${output}:${output === "found" ? "var:db" : "duckdb"}:true:true`),
  );
});

test("errors", () => {
  assert.throws(() => convert("# T\n\n```sql outptu=x\nSELECT 1\n```"), /unknown cell attribute outptu=x/);
  assert.throws(() => convert("# T\n\n```sql output=a output=b\nSELECT 1\n```"), /output is set twice/);
  assert.throws(() => convert("# T\n\n```python format=jsoon\n1\n```"), /unknown format jsoon/);
  assert.throws(() => convert("# T\n\n```js database=duckdb\n1\n```"), /a js cell can't have database/);
  assert.throws(() => convert("# T\n\n```js\n1\n\n## Next"), /the fence isn't closed/);
  assert.throws(() => convert("# T\n\n```js\n1\n    ```"), /the fence isn't closed/);
  assert.throws(() => convert("# T\n\n```html\n<b>\n\n```sql output=x\nSELECT 1\n```"), /the fence isn't closed before the next fence/);
  assert.throws(() => convert("# T\n\n```\n12 rows\n\n```sql output=x\nSELECT 1\n```\n\n```js\n1\n```"), /line 3: the fence isn't closed before the next fence/);
  assert.throws(() => convert("# T\n\n```js\n1\n\n```text\nx\n```"), /the fence isn't closed before the next fence/);
  assert.throws(() => convert("# T\n\n<!-- TODO\n\n```js\n1\n```"), /the HTML comment isn't closed/);
  assert.throws(() => convert("# T\n\n<style>\nb {}\n\n```js\n1\n```"), /the HTML <style> isn't closed/);
  assert.throws(() => convert("# T\n\n```js output=x\n1\n```"), /a js cell can't have output/);
  assert.throws(() => convert("# T\n\n```SQL\nSELECT 1\n```"), /unknown cell type SQL/);
  assert.throws(() => convert("# T\n\n```sq output=x\nSELECT 1\n```"), /unknown cell type sq/);
  assert.throws(() => convert("# T\n\n```Python\n1\n```"), /unknown cell type Python; cell types are lowercase/);
  assert.throws(() => convert("```js\n1\n```"), /no "# " heading/);
});
