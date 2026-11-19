# Stillwell notebooks

[Observable](https://observablehq.com/notebook-kit/) notebooks that read [Stillwell](https://openwatersio.github.io/stillwell/docs/), Open Waters' store of water levels, at `https://stillwell.openwaters.io/`.

They're published at https://openwatersio.github.io/stillwell-notebooks/, and rebuilt each day.

## Add a notebook

1. Add an HTML file to [notebooks/](notebooks/) in [Notebook Kit's format](https://observablehq.com/notebook-kit/): a `<notebook>` element with a `<title>` and one `<script>` per cell. [getting-started.html](notebooks/getting-started.html) is an example.
2. Open it in a pull request. The [Pages workflow](.github/workflows/pages.yml) builds it, and deploys it once it's merged.

The file name is the notebook's address: `notebooks/tides.html` publishes at `/stillwell-notebooks/tides.html`. The index lists every notebook by its `<title>`. [index.js](index.js) writes it on every build as `notebooks/index.html`, so that name can't be used for a notebook.

## Queries

A SQL cell runs either when the notebook is built or in the reader's browser.

- **At build time:** `<script type="application/sql" database="duckdb">`. DuckDB runs the query when the site builds, and the page loads its saved result, so it opens quickly. The query can't use `${…}`. Results are arrays of objects, with times as `Date`s. A query that fails stops the build, and the daily build keeps the results current.
- **In the browser:** `database="var:db"`, for a query that takes the reader's input through `${…}`, such as a search box. `db` is a DuckDB-WASM client with ranged reads, so a query fetches only the parts of a file it needs:

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

`npm run preview` serves the notebooks and reloads them on change. It writes the index when it starts, so restart it to list a new notebook or a changed title. `npm run build` writes the site to `dist/`.

Don't format the notebooks with Prettier. It ends expression cells such as `table(found)` with a semicolon, which turns them into statements that display nothing.
