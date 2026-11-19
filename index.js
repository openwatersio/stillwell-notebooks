// Writes notebooks/index.html, a notebook that links every other notebook by its <title>.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "notebooks");

// Titles are HTML text, so entities stay as they are. This escapes what Markdown and Notebook Kit's ${…} would read.
const escape = (text) => text.replace(/\s+/g, " ").replace(/[[\]\\`*_~$]/g, (c) => `&#${c.charCodeAt(0)};`);
// encodeURIComponent leaves ( and ), which would end a Markdown link.
const href = (file) => encodeURIComponent(file).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const items = readdirSync(dir)
  .filter((file) => file.endsWith(".html") && file !== "index.html")
  .map((file) => {
    const title = readFileSync(join(dir, file), "utf8").match(/<title>([^<]*)<\/title>/)?.[1].trim();
    if (!title) throw new Error(`notebooks/${file} has no <title>`);
    return { file, title };
  })
  .sort((a, b) => a.title.localeCompare(b.title) || a.file.localeCompare(b.file));

writeFileSync(
  join(dir, "index.html"),
  `<!doctype html>
<notebook theme="light-dark(air, midnight)" readonly>
  <title>Stillwell notebooks</title>
  <script type="text/markdown">
    # Stillwell notebooks

    Observable notebooks that read [Stillwell](https://openwatersio.github.io/stillwell/docs/), Open Waters' store of water levels, live in your browser.

${items.map(({ file, title }) => `    - [${escape(title)}](${href(file)})`).join("\n")}

    The source for each notebook is in [openwatersio/stillwell-notebooks](https://github.com/openwatersio/stillwell-notebooks).
  </script>
</notebook>
`,
);
