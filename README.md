# Stillwell notebooks

[Observable](https://observablehq.com/notebook-kit/) notebooks that read [Stillwell](https://openwatersio.github.io/stillwell/docs/), Open Waters' store of water levels, at `https://stillwell.openwaters.io/`.

They're published at https://openwatersio.github.io/stillwell-notebooks/, and rebuilt each day.

## Add a notebook

1. Add a Markdown file to [notebooks/](notebooks/). [getting-started.md](notebooks/getting-started.md) is an example.
2. Open it in a pull request. The [Pages workflow](.github/workflows/pages.yml) builds it, and deploys it once it's merged.

Each file becomes a notebook in [Notebook Kit's format](https://observablehq.com/notebook-kit/), which [md.js](md.js) writes as `notebooks/<name>.html` on every build:

- The first `# ` heading is the notebook's title.
- Prose becomes Markdown cells, which can use `${…}` to show a value from another cell.
- A top-level fence whose language is a cell type runs as a cell: `js`, `ts`, `ojs`, `sql`, `html`, `tex`, `dot`, `node`, `python` or `r`. Words after the language set the cell's attributes: `output=<name>` names a SQL cell's result, `database=<name>` picks its database, `format=<format>` sets a `node`, `python` or `r` cell's output format, `hidden` hides its output, and `pinned` shows its code. Cell types are lowercase. A misspelled or misplaced attribute stops the build, as does a fence or an HTML comment left open, which would otherwise swallow the cells after it.
- Any other fence, such as ```` ```text ````, stays in the prose as a code block, as does a fence inside a list, a blockquote or an HTML comment. A fence after a blank line inside another HTML block, such as `<details>`, still runs as a cell.
- Each run of prose between cells renders on its own, so a reference link such as `[docs][d]` needs its `[d]: …` definition in the same run.

````md
# Hoek van Holland

```sql output=levels database=duckdb hidden pinned
SELECT time, level_m FROM 'https://stillwell.openwaters.io/obs/rws/hoekvanholland/2025.parquet' WHERE flag <= 2
```

```js
Plot.lineY(levels, { x: "time", y: "level_m" }).plot()
```
````

The file name is the notebook's address: `notebooks/tides.md` publishes at `/stillwell-notebooks/tides.html`. The index lists every notebook by its title. [index.js](index.js) writes it on every build as `notebooks/index.html`, so `index.md` can't be used for a notebook. Files whose names start with `.` are skipped.

## Queries

A SQL cell runs either when the notebook is built or in the reader's browser.

- **At build time:** ```` ```sql database=duckdb ````. DuckDB runs the query when the site builds, and the page loads its saved result, so it opens quickly. The query can't use `${…}`. Results are arrays of objects, with times as `Date`s. A query that fails stops the build, and the daily build keeps the results current.
- **In the browser:** ```` ```sql database=var:db ````, for a query that takes the reader's input through `${…}`, such as a search box. `db` is a DuckDB-WASM client with ranged reads, so a query fetches only the parts of a file it needs:

  ```js
  const db = await DuckDBClient.of({}, { filesystem: { forceFullHTTPReads: false } });
  ```

  Without `forceFullHTTPReads: false`, Notebook Kit downloads each file whole. Each query opens its own connection, so settings need `SET GLOBAL`. Results are Arrow tables, with times as milliseconds since 1970.

Build-time queries run in UTC, as [notebooks/.observable/databases.json](notebooks/.observable/databases.json) sets. Stillwell asks for a `User-Agent` that names the project, and [duckdb-secret.js](duckdb-secret.js) saves a DuckDB secret that sends one. The npm scripts point `HOME` at `notebooks/.observable/home` while they run, so that secret and DuckDB's extensions stay out of your own home directory.

## Preview and build

```bash
npm install
npm run preview
```

`npm run preview` serves the notebooks and reloads them on change. It converts the Markdown and writes the index when it starts, so restart it after changing a Markdown file. `npm run build` writes the site to `dist/`, and `npm test` tests the Markdown converter.

Don't format the notebooks with Prettier. It ends expression cells such as `table(found)` with a semicolon, which turns them into statements that display nothing.
